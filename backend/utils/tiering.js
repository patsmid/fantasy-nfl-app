// tiering.js (versión mejorada y robusta)
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

const DEFAULT_OPTIONS = {
  dropoffMedianMultiplier: 1.25,
  dropoffMinAbsolute: 0.5,
  zThreshold: 1.25,
  maxClusters: defaultMaxClusters,
  minTierSize,
  debug: false
};

export function assignTiers(players, groupByPosition = false, options = {}) {
  if (!Array.isArray(players) || players.length === 0) return players;
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const hasHybridData = players.some(p => Number.isFinite(p.adjustedVOR) && Number.isFinite(p.dropoff));
  if (hasHybridData) {
    assignTiersHybrid(players, groupByPosition, opts);
  } else {
    const enoughDataForClustering = players.some(p => Number.isFinite(p.vor));
    if (enoughDataForClustering) assignTiersByClustering(players, groupByPosition, opts);
    else assignTiersByDropoff(players, groupByPosition, opts);
  }

  // asignar labels
  const tiers = players.map(p => Number(p.tier || 1));
  const maxTier = tiers.length ? Math.max(...tiers) : 1;
  for (const p of players) {
    p.tier_label = getTierLabel(Number(p.tier || 1), maxTier);
  }
  return players;
}

function getTierLabel(tier, totalTiers = 5) {
  const available = tierLabels.slice(0, totalTiers);
  while (available.length < totalTiers) {
    available.push(tierLabels[tierLabels.length - 1]);
  }
  const idx = Math.min(Math.max(tier - 1, 0), available.length - 1);
  return available[idx];
}

export function assignTiersHybrid(players, groupByPosition = false, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const groups = getGroups(players, groupByPosition);

  for (const groupKey of Object.keys(groups)) {
    const group = groups[groupKey];
    if (!group || group.length === 0) continue;

    // Precalcular values y orden estable
    const items = group.map((p, idx) => {
      const value = Number.isFinite(p.adjustedVOR) ? p.adjustedVOR : Number.isFinite(p.vor) ? p.vor : 0;
      const proj = Number.isFinite(p.projection) ? p.projection : 0;
      return { p, idx, value, proj };
    }).sort((a, b) => {
      if (b.value !== a.value) return b.value - a.value;
      if (b.proj !== a.proj) return b.proj - a.proj;
      return ('' + a.p.player_id).localeCompare('' + b.p.player_id);
    });

    if (items.length === 0) continue;
    const values = items.map(it => it.value);
    const dropoffs = computeDropoffs(values);

    const medianDrop = median(dropoffs);
    const meanDrop = mean(dropoffs);
    const sdDrop = std(dropoffs);

    const breakIndices = [];
    const dropThreshold = Math.max(medianDrop * opts.dropoffMedianMultiplier, opts.dropoffMinAbsolute);

    for (let i = 0; i < dropoffs.length; i++) {
      const gap = dropoffs[i];
      const isBigByMedian = gap >= dropThreshold;
      const isBigByZ = sdDrop > 0 ? ((gap - meanDrop) / sdDrop) >= opts.zThreshold : false;
      if (isBigByMedian || isBigByZ) breakIndices.push(i);
    }

    const segments = splitIndicesToSegments(items.length, breakIndices, {
      minSize: Math.max(2, opts.minTierSize),
      maxSegments: opts.maxClusters
    });

    let tierOffset = 0;
    for (const seg of segments) {
      const segItems = items.slice(seg.start, seg.end + 1);
      const segValues = segItems.map(it => it.value);

      const kSeg = Math.min(opts.maxClusters, Math.max(1, Math.round(segItems.length / 4)));
      if (kSeg <= 1 || segItems.length <= Math.max(opts.minTierSize, 3)) {
        segItems.forEach(it => { it.p.tier = tierOffset + 1; });
        tierOffset += 1;
      } else {
        const { labels, centroids } = kMeans1D(segValues, kSeg);
        const centroidOrder = centroids.map((c, i) => ({ c, i })).sort((a, b) => b.c - a.c).map(o => o.i);
        const clusterRank = new Array(centroids.length);
        centroidOrder.forEach((clusterIndex, rank) => { clusterRank[clusterIndex] = rank; });

        segItems.forEach((it, idx) => {
          const clusterIdx = labels[idx];
          const rank = clusterRank[clusterIdx] ?? clusterIdx;
          it.p.tier = tierOffset + rank + 1;
        });
        tierOffset += Math.max(1, centroids.length);
      }
    }
  }
  return players;
}

export function assignTiersByClustering(players, groupByPosition = false, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const groups = getGroups(players, groupByPosition);

  for (const key of Object.keys(groups)) {
    const group = groups[key];
    if (!group || group.length === 0) continue;

    const values = group.map(p => Number.isFinite(p.vor) ? p.vor : (Number.isFinite(p.adjustedVOR) ? p.adjustedVOR : 0));
    if (values.length === 0) continue;

    const k = Math.min(opts.maxClusters, Math.max(2, Math.floor(values.length / 4)));

    if (values.length <= k) {
      const sorted = group.slice().sort((a, b) => (b.vor ?? b.adjustedVOR ?? 0) - (a.vor ?? a.adjustedVOR ?? 0));
      sorted.forEach((p, i) => { p.tier = Math.floor(i / Math.max(1, Math.ceil(sorted.length / k))) + 1; });
      continue;
    }

    const { labels, centroids } = kMeans1D(values, k);
    const centroidOrder = centroids.map((c, i) => ({ c, i })).sort((a, b) => b.c - a.c).map(o => o.i);
    const clusterRank = new Array(centroids.length);
    centroidOrder.forEach((clusterIndex, rank) => { clusterRank[clusterIndex] = rank; });

    group.forEach((p, idx) => {
      const clusterIdx = labels[idx];
      const rank = clusterRank[clusterIdx] ?? clusterIdx;
      p.tier = rank + 1;
    });
  }
  return players;
}

export function assignTiersByDropoff(players, groupByPosition = false, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const groups = getGroups(players, groupByPosition);

  for (const key of Object.keys(groups)) {
    const group = groups[key];
    if (!group || group.length === 0) continue;

    const items = group.map((p, idx) => {
      const value = Number.isFinite(p.vor) ? p.vor : (Number.isFinite(p.adjustedVOR) ? p.adjustedVOR : 0);
      return { p, idx, value };
    }).sort((a, b) => b.value - a.value);

    const values = items.map(it => it.value);
    if (values.length === 0) continue;

    const dropoffs = computeDropoffs(values);
    const medianDrop = median(dropoffs);
    const meanDrop = mean(dropoffs);
    const sdDrop = std(dropoffs);

    const threshold = Math.max(medianDrop * opts.dropoffMedianMultiplier, meanDrop + opts.zThreshold * sdDrop, opts.dropoffMinAbsolute);

    const breaks = [];
    for (let i = 0; i < dropoffs.length; i++) {
      if (dropoffs[i] >= threshold) breaks.push(i);
    }

    const segments = splitIndicesToSegments(items.length, breaks, {
      minSize: Math.max(2, opts.minTierSize),
      maxSegments: opts.maxClusters
    });

    let tier = 1;
    for (const seg of segments) {
      const segItems = items.slice(seg.start, seg.end + 1);
      segItems.forEach(it => { it.p.tier = tier; });
      tier++;
    }
  }

  return players;
}

/* ---------- UTILIDADES ---------- */

function getGroups(players, groupByPosition) {
  if (!groupByPosition) return { all: players };
  return players.reduce((acc, p) => {
    const key = p.position || 'UNK';
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});
}

function computeDropoffs(values) {
  const drops = [];
  for (let i = 0; i < values.length - 1; i++) {
    drops.push(Math.max(0, (values[i] || 0) - (values[i + 1] || 0)));
  }
  return drops;
}

/**
 * splitIndicesToSegments: crea segmentos a partir de breakIndices y aplica minSize y maxSegments
 * - Estrategia de merge: fusiona segmentos pequeños con vecino que produce menor tamaño combinado
 */
function splitIndicesToSegments(length, breakIndices, { minSize = 4, maxSegments = defaultMaxClusters } = {}) {
  const rawCuts = [...new Set(breakIndices)].sort((a, b) => a - b);
  const segments = [];
  let start = 0;
  for (let cut of rawCuts) {
    const end = Math.min(cut, length - 1);
    segments.push({ start, end });
    start = end + 1;
  }
  if (start <= length - 1) segments.push({ start, end: length - 1 });

  // merge pequeños: preferir fusionar con vecino que produce menor tamaño combinado
  let merged = [...segments];
  // first pass: merge adjacent where size < minSize
  for (let i = 0; i < merged.length; i++) {
    const cur = merged[i];
    const size = cur.end - cur.start + 1;
    if (size < minSize) {
      // choose neighbor (left or right) with smaller combined size
      const left = merged[i - 1];
      const right = merged[i + 1];
      if (!left && !right) continue;
      if (!left) {
        // merge to right
        right.start = cur.start;
        merged.splice(i, 1);
        i--;
        continue;
      }
      if (!right) {
        left.end = cur.end;
        merged.splice(i, 1);
        i--;
        continue;
      }
      const leftSize = left.end - left.start + 1;
      const rightSize = right.end - right.start + 1;
      if (leftSize <= rightSize) {
        left.end = cur.end;
      } else {
        right.start = cur.start;
      }
      merged.splice(i, 1);
      i--;
    }
  }

  // if still more than maxSegments, merge smallest-adjacent-pair iteratively
  while (merged.length > maxSegments) {
    let bestIdx = -1;
    let bestCombined = Infinity;
    for (let i = 0; i < merged.length - 1; i++) {
      const left = merged[i];
      const right = merged[i + 1];
      const combined = (left.end - left.start + 1) + (right.end - right.start + 1);
      if (combined < bestCombined) {
        bestCombined = combined;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      merged[bestIdx].end = merged[bestIdx + 1].end;
      merged.splice(bestIdx + 1, 1);
    } else break;
  }

  return merged;
}

/* Stat helpers */
function mean(arr) { if (!arr || arr.length === 0) return 0; return arr.reduce((s,x)=>s+x,0)/arr.length; }
function median(arr) { if (!arr || arr.length === 0) return 0; const a=[...arr].sort((x,y)=>x-y); const m=Math.floor(a.length/2); return a.length%2===0 ? (a[m-1]+a[m])/2 : a[m]; }
function std(arr) { if (!arr || arr.length === 0) return 0; const m=mean(arr); return Math.sqrt(arr.reduce((s,x)=>s+Math.pow(x-m,2),0)/arr.length); }

/* kMeans 1D determinista con re-asignación simple para clusters vacíos */
function kMeans1D(values, k = 3, maxIter = 200) {
  const n = values.length;
  if (n === 0) return { labels: [], centroids: [] };
  if (k <= 1) return { labels: new Array(n).fill(0), centroids: [mean(values)] };
  k = Math.min(k, n);

  const sortedVals = [...values].slice().sort((a,b)=>a-b);
  const minV = sortedVals[0];
  const maxV = sortedVals[sortedVals.length - 1];

  const centroids = [];
  for (let i = 0; i < k; i++) {
    centroids.push(minV + ((i + 0.5) / k) * (maxV - minV));
  }

  let labels = new Array(n).fill(0);

  for (let iter=0; iter<maxIter; iter++) {
    // assign
    for (let i=0;i<n;i++) {
      let best = 0, bestD = Math.abs(values[i]-centroids[0]);
      for (let c=1;c<k;c++){
        const d = Math.abs(values[i]-centroids[c]);
        if (d < bestD) { bestD = d; best = c; }
      }
      labels[i] = best;
    }

    // recompute
    const sums = new Array(k).fill(0);
    const counts = new Array(k).fill(0);
    for (let i=0;i<n;i++) { sums[labels[i]] += values[i]; counts[labels[i]] += 1; }

    let changed = false;
    for (let c=0;c<k;c++) {
      let newC;
      if (counts[c] === 0) {
        // reassign centroid determinísticamente a un cuantíl para evitar clusters vacíos
        const quantileIndex = Math.floor(((c + 0.5) / k) * n);
        newC = sortedVals[Math.min(Math.max(0, quantileIndex), n-1)];
      } else {
        newC = sums[c] / counts[c];
      }
      if (Math.abs(newC - centroids[c]) > 1e-9) changed = true;
      centroids[c] = newC;
    }
    if (!changed) break;
  }

  return { labels, centroids };
}
