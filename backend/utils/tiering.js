// tiering.js
// Versión refactorizada y robusta para asignación de tiers
// Exporta: assignTiers, assignTiersHybrid, assignTiersByClustering, assignTiersByDropoff

const minTierSize = 4;
const defaultMaxClusters = 7;
const tierLabels = [
  '🔥 Elite',
  '💎 Top',
  '⭐ Starter',
  '✅ Confiable',
  '🔄 Relleno',
  '📦 Profundidad',
  '⚠️ Riesgo',
  '🪑 Bench'
];

/**
 * Opciones globales para tunear comportamiento.
 * - dropoffMultiplier: multiplicador aplicado sobre la mediana de dropoffs para decidir cortes.
 * - zThreshold: umbral en unidades de desviación estándar (sd) para detectar outlier gaps.
 */
const DEFAULT_OPTIONS = {
  dropoffMedianMultiplier: 1.25,
  dropoffMinAbsolute: 0.5,
  zThreshold: 1.25,
  maxClusters: defaultMaxClusters,
  minTierSize
};

/* -------------------------
   API principal
   ------------------------- */

/**
 * Decide la técnica a usar (hybrid / clustering / dropoff) según disponibilidad de datos.
 * Modifica players in-place añadiendo: player.tier (1-based) y player.tier_label
 *
 * @param {Array} players
 * @param {boolean} groupByPosition
 * @param {Object} options
 * @returns {Array} players
 */
export function assignTiers(players, groupByPosition = false, options = {}) {
  if (!Array.isArray(players) || players.length === 0) return players;
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const hasHybridData = players.some(
    p => typeof p.adjustedVOR === 'number' && typeof p.dropoff === 'number'
  );

  if (hasHybridData) {
    assignTiersHybrid(players, groupByPosition, opts);
  } else {
    const enoughDataForClustering = players.some(p => typeof p.vor === 'number');
    if (enoughDataForClustering) assignTiersByClustering(players, groupByPosition, opts);
    else assignTiersByDropoff(players, groupByPosition, opts);
  }

  // etiqueta legible
  const tiers = players.map(p => Number(p.tier || 1));
  const maxTier = tiers.length ? Math.max(...tiers) : 1;
  for (const p of players) {
    p.tier_label = getTierLabel(Number(p.tier || 1), maxTier);
  }

  return players;
}

/**
 * getTierLabel: asegura que siempre devolvemos un label, aunque el número de tiers supere labels length.
 * @param {number} tier 1-based
 * @param {number} totalTiers
 */
function getTierLabel(tier, totalTiers = 5) {
  const available = tierLabels.slice(0, totalTiers);
  if (available.length < totalTiers) {
    const last = tierLabels[tierLabels.length - 1];
    for (let i = available.length; i < totalTiers; i++) available.push(last);
  }
  const idx = Math.min(Math.max(tier - 1, 0), available.length - 1);
  return available[idx];
}

/* -------------------------
   Función híbrida (dropoff + clustering)
   ------------------------- */

/**
 * assignTiersHybrid: detecta cortes por dropoff (rupturas) y dentro de cada segmento ejecuta clustering.
 * - players: array modificado in-place
 * - groupByPosition: si true, aplica por posición
 * - options: ver DEFAULT_OPTIONS
 */
export function assignTiersHybrid(players, groupByPosition = false, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const groups = getGroups(players, groupByPosition);

  for (const groupKey of Object.keys(groups)) {
    const group = groups[groupKey];
    if (!group || group.length === 0) continue;

    // Precalcular valores y ordenar por valor descendente
    const items = group.map((p, idx) => {
      const value = Number(p.adjustedVOR ?? p.vor ?? 0);
      return { p, idx, value, drop: Math.abs(Number(p.dropoff ?? 0)) };
    }).sort((a, b) => b.value - a.value);

    if (items.length === 0) continue;

    const values = items.map(it => it.value);
    const dropoffs = computeDropoffs(values);

    // Métricas robustas
    const medianDrop = median(dropoffs);
    const meanDrop = mean(dropoffs);
    const sdDrop = std(dropoffs);

    // Detectar índices con gaps significativos
    const breakIndices = [];
    const dropThreshold = Math.max(medianDrop * opts.dropoffMedianMultiplier, opts.dropoffMinAbsolute);

    for (let i = 0; i < dropoffs.length; i++) {
      const gap = dropoffs[i];
      const isBigByMedian = gap >= dropThreshold;
      const isBigByZ = sdDrop > 0 ? ((gap - meanDrop) / sdDrop) >= opts.zThreshold : false;
      if (isBigByMedian || isBigByZ) breakIndices.push(i);
    }

    // Generar segmentos a partir de breakIndices, respetando minTierSize y maxClusters
    const segments = splitIndicesToSegments(items.length, breakIndices, {
      minSize: opts.minTierSize,
      maxSegments: opts.maxClusters
    });

    // Para cada segmento aplicar clustering (si grande) o asignar mismo tier
    let tierOffset = 0;
    for (const seg of segments) {
      const segItems = items.slice(seg.start, seg.end + 1);
      const segValues = segItems.map(it => it.value);

      // decide cantidad de clusters dentro del segmento
      const kSeg = Math.min(opts.maxClusters, Math.max(1, Math.round(segItems.length / 4)));

      if (kSeg <= 1 || segItems.length <= Math.max(opts.minTierSize, 3)) {
        // un único tier para el segmento
        segItems.forEach(it => { it.p.tier = tierOffset + 1; });
        tierOffset += 1;
      } else {
        // clustering 1D seguro
        const { labels, centroids } = kMeans1D(segValues, kSeg);
        // ordenar clusters por centroides descendentes (clusterRank 0 = mejor)
        const centroidOrder = centroids
          .map((c, i) => ({ c, i }))
          .sort((a, b) => b.c - a.c)
          .map(obj => obj.i);

        const clusterRank = new Array(centroids.length);
        centroidOrder.forEach((clusterIndex, rank) => { clusterRank[clusterIndex] = rank; });

        // asignar tiers con offset (1-based)
        segItems.forEach((it, idx) => {
          const clusterIdx = labels[idx];
          const rank = clusterRank[clusterIdx] ?? clusterIdx;
          it.p.tier = tierOffset + rank + 1;
        });

        tierOffset += Math.max(1, centroids.length);
      }
    } // segments

  } // groups

  return players;
}

/* -------------------------
   Clustering (por valor: vor o adjustedVOR)
   ------------------------- */

/**
 * assignTiersByClustering: aplica k-means 1D sobre todo el grupo y asigna tiers según centroides ordenados.
 * - players: array modificado in-place
 */
export function assignTiersByClustering(players, groupByPosition = false, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const groups = getGroups(players, groupByPosition);

  for (const key of Object.keys(groups)) {
    const group = groups[key];
    if (!group || group.length === 0) continue;

    const values = group.map(p => Number(p.vor ?? p.adjustedVOR ?? 0));
    if (values.length === 0) continue;

    const k = Math.min(opts.maxClusters, Math.max(2, Math.floor(values.length / 4)));

    // si hay pocos datos, no clusterizar en más de elementos
    if (values.length <= k) {
      // asignar tiers por orden
      const sorted = group.slice().sort((a, b) => (b.vor ?? b.adjustedVOR ?? 0) - (a.vor ?? a.adjustedVOR ?? 0));
      sorted.forEach((p, i) => { p.tier = Math.floor(i / Math.max(1, Math.ceil(sorted.length / k))) + 1; });
      continue;
    }

    const { labels, centroids } = kMeans1D(values, k);

    // centroids -> orden descendente para mapear cluster -> tier rank
    const centroidOrder = centroids
      .map((c, i) => ({ c, i }))
      .sort((a, b) => b.c - a.c)
      .map(obj => obj.i);

    const clusterRank = new Array(centroids.length);
    centroidOrder.forEach((clusterIndex, rank) => { clusterRank[clusterIndex] = rank; });

    // labels aligned with original group order
    group.forEach((p, idx) => {
      const valueIdx = idx; // labels aligned to group index
      const clusterIdx = labels[valueIdx];
      const rank = clusterRank[clusterIdx] ?? clusterIdx;
      p.tier = rank + 1;
    });
  }

  return players;
}

/* -------------------------
   Dropoff-only tiers (clásico)
   ------------------------- */

/**
 * assignTiersByDropoff: corta por gaps en dropoffs con umbral dinámico (mediana + sd), respeta minTierSize.
 */
export function assignTiersByDropoff(players, groupByPosition = false, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const groups = getGroups(players, groupByPosition);

  for (const key of Object.keys(groups)) {
    const group = groups[key];
    if (!group || group.length === 0) continue;

    // preparar array ordenado por valor descendente
    const items = group.map((p, idx) => {
      const value = Number(p.vor ?? p.adjustedVOR ?? 0);
      return { p, idx, value };
    }).sort((a, b) => b.value - a.value);

    const values = items.map(it => it.value);
    if (values.length === 0) continue;

    const dropoffs = computeDropoffs(values);
    const medianDrop = median(dropoffs);
    const meanDrop = mean(dropoffs);
    const sdDrop = std(dropoffs);

    const threshold = Math.max(medianDrop * opts.dropoffMedianMultiplier, meanDrop + opts.zThreshold * sdDrop, opts.dropoffMinAbsolute);

    // marcar cortes
    const breaks = [];
    for (let i = 0; i < dropoffs.length; i++) {
      if (dropoffs[i] >= threshold) breaks.push(i);
    }

    // formar segmentos y ajustar por size
    const segments = splitIndicesToSegments(items.length, breaks, {
      minSize: opts.minTierSize,
      maxSegments: opts.maxClusters
    });

    // asignar tiers por segmento (una única tier cada segmento)
    let tier = 1;
    for (const seg of segments) {
      const segItems = items.slice(seg.start, seg.end + 1);
      segItems.forEach(it => { it.p.tier = tier; });
      tier++;
    }
  }

  return players;
}

/* -------------------------
   Utilidades internas
   ------------------------- */

/** Agrupa por posición o devuelve un grupo ALL */
function getGroups(players, groupByPosition) {
  if (!groupByPosition) return { all: players };
  return players.reduce((acc, p) => {
    const key = p.position || 'UNK';
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});
}

/** Calcula array de dropoffs: drop[i] = values[i] - values[i+1] */
function computeDropoffs(values) {
  const drops = [];
  for (let i = 0; i < values.length - 1; i++) {
    drops.push(Math.max(0, values[i] - values[i + 1]));
  }
  return drops;
}

/** Split indices into contiguous segments ensuring minSize and maxSegments */
function splitIndicesToSegments(length, breakIndices, { minSize = 4, maxSegments = defaultMaxClusters } = {}) {
  // start from 0 ... length-1, breakIndices are indices i where break occurs after i (i splits between i and i+1)
  const rawCuts = [...new Set(breakIndices)].sort((a, b) => a - b);
  const segments = [];
  let start = 0;

  for (let cut of rawCuts) {
    const end = Math.min(cut, length - 1);
    segments.push({ start, end });
    start = end + 1;
  }
  // último segmento
  if (start <= length - 1) segments.push({ start, end: length - 1 });

  // garantizar minSize: fusionar pequeños con vecino derecho/izquierdo sensible
  let merged = [];
  for (let seg of segments) {
    if (merged.length === 0) {
      merged.push(seg);
    } else {
      const last = merged[merged.length - 1];
      const lastSize = last.end - last.start + 1;
      const curSize = seg.end - seg.start + 1;
      if (lastSize < minSize) {
        // fusionar a la izquierda
        last.end = seg.end;
      } else if (curSize < minSize) {
        // fusionar a la izquierda (preferible)
        last.end = seg.end;
      } else {
        merged.push(seg);
      }
    }
  }

  // si quedan demasiados segmentos, fusionar de derecha a izquierda hasta maxSegments
  while (merged.length > maxSegments) {
    // fusionar el par de segmentos adyacentes con menor "gap" (pequeño impacto)
    let bestIdx = 0;
    let bestCost = Infinity;
    for (let i = 0; i < merged.length - 1; i++) {
      const left = merged[i];
      const right = merged[i + 1];
      const cost = (right.start - left.end); // prefer smaller separations
      if (cost < bestCost) { bestCost = cost; bestIdx = i; }
    }
    const left = merged[bestIdx];
    const right = merged[bestIdx + 1];
    left.end = right.end;
    merged.splice(bestIdx + 1, 1);
  }

  return merged;
}

/* Estadísticos */
function mean(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}
function median(arr) {
  if (!arr || arr.length === 0) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 === 0 ? (a[m - 1] + a[m]) / 2 : a[m];
}
function std(arr) {
  if (!arr || arr.length === 0) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length);
}

/* -------------------------
   Implementación k-means 1D (determinista)
   - Devuelve { labels: number[], centroids: number[] }
   - labels[i] corresponde al cluster de values[i]
   ------------------------- */
function kMeans1D(values, k = 3, maxIter = 200) {
  const n = values.length;
  if (n === 0) return { labels: [], centroids: [] };
  if (k <= 1) return { labels: new Array(n).fill(0), centroids: [mean(values)] };
  k = Math.min(k, n);

  // inicializar centroides equidistantes entre min y max para determinismo
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const centroids = [];
  for (let i = 0; i < k; i++) {
    centroids.push(minV + ((i + 0.5) / k) * (maxV - minV));
  }

  let labels = new Array(n).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    // asignar etiquetas
    for (let i = 0; i < n; i++) {
      let best = 0, bestDist = Math.abs(values[i] - centroids[0]);
      for (let c = 1; c < k; c++) {
        const d = Math.abs(values[i] - centroids[c]);
        if (d < bestDist) { bestDist = d; best = c; }
      }
      labels[i] = best;
    }

    // recomputar centroides
    const sums = new Array(k).fill(0);
    const counts = new Array(k).fill(0);
    for (let i = 0; i < n; i++) {
      const l = labels[i];
      sums[l] += values[i];
      counts[l] += 1;
    }
    let changed = false;
    for (let c = 0; c < k; c++) {
      const newC = counts[c] === 0 ? centroids[c] : sums[c] / counts[c];
      if (Math.abs(newC - centroids[c]) > 1e-9) changed = true;
      centroids[c] = newC;
    }
    if (!changed) break;
  }

  return { labels, centroids };
}

/* -------------------------
   Exports (funciones principales arriba)
   ------------------------- */
