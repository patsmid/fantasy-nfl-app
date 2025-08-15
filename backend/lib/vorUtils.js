// improved_vor.js
// Versión mejorada de calculateVORandDropoffPro
// Mantiene la API pero introduce opciones y estabiliza cálculos.

// Uso: calculateVORandDropoffPro(projections, starterPositions, numTeams, options)

export function calculateVORandDropoffPro(projections, starterPositions, numTeams, options = {}) {
  // opciones con valores por defecto (ajustables por liga)
  const opts = {
    replacementDefaults: { QB: 18, RB: 45, WR: 45, TE: 18, K: 12, DST: 12 },
    replacementOffset: { QB: 0, RB: 3, WR: 3, TE: 1, K: 0, DST: 0 },
    replacementWindow: 3,       // promedia +/- window alrededor del índice de replacement
    dropoffWindow: 3,          // para calcular dropoffs suavizados
    tierZThreshold: 1.5,       // z-score para considerar un gap como tierBonus
    tierPercentileThreshold: 0.90, // o percentile (fallback)
    scarcityWeights: { RB: 2.0, WR: 1.4, QB: 1.7, TE: 1.2, K: 1.0, DST: 1.0 },
    maxScarcityMultiplier: 1.6, // cap al factor final
    minScarcityMultiplier: 0.7,
    maxRiskPenalty: 0.30,      // margen máximo de penalización por varianza (30%)
    injuryCurve: 0.5,          // cómo mapear injuryRisk a multiplicador: 1 - (risk^injuryCurve * factor)
    injuryFactor: 0.6,
    playoffWeightFactor: 0.25,
    playoffWeeks: [14,15,16],
    ...options
  };

  const starterCounts = getStarterCounts(starterPositions);
  const posBuckets = groupPlayersByPosition(projections);
  const result = [];

  for (const [pos, list] of Object.entries(posBuckets)) {
    const available = list.filter(p => p.status === 'LIBRE' || !p.status);
    // sort descendente por proyección
    const sorted = [...available].sort((a, b) => (b.total_projected || 0) - (a.total_projected || 0));

    // número de titulares esperados para la posición (puede ser decimal por flex)
    const startersAtPos = starterCounts[pos] || 0;
    // N: cantidad total de jugadores titularesh en todas las ligas (floor para evitar sobreestimar)
    const N = Math.max(0, Math.floor(startersAtPos * numTeams));

    // índice base del replacement
    const baseReplacementIndex = N + (opts.replacementOffset[pos] || 0);
    // limitar dentro del array
    const boundedIndex = clamp(baseReplacementIndex, 0, Math.max(sorted.length - 1, 0));

    // Para reducir ruido, tomamos la media de una ventana centrada en boundedIndex:
    const replacementValue = meanWindow(sorted, boundedIndex, opts.replacementWindow, p => p?.total_projected || 0);

    // avgDropoff: usa top (N or min) pero amplia la ventana para capturar estructura
    const avgDropoff = computeWeightedDropoffStable(sorted, Math.max(1, N || 1), opts.dropoffWindow);

    // scarcityFactor robusto: normalizamos y lo capamos
    const scarcityFactorRaw = computeScarcityFactorRobust(pos, startersAtPos, numTeams, avgDropoff, replacementValue, opts);
    const scarcityFactor = clamp(scarcityFactorRaw, opts.minScarcityMultiplier, opts.maxScarcityMultiplier);

    // Precompute moving dropoffs for tier detection
    const positionalDropoffs = computePositionalDropoffs(sorted);

    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i];
      const baseProj = Number((p.total_projected || 0));
      // 1️⃣ VOR puro (vs replacementValue)
      const vor = baseProj - replacementValue;

      // 2️⃣ ajuste por escasez
      const adjustedVOR = vor * scarcityFactor;

      // 3️⃣ ajuste por riesgo (consistencia) -> coeficiente de variación con floors
      const riskAdjustment = getRiskAdjustmentRobust(p, opts.maxRiskPenalty);
      const riskAdjustedVOR = adjustedVOR * riskAdjustment;

      // 4️⃣ ajuste por lesión (más gradual)
      const injuryAdj = getInjuryAdjustment(p, opts.injuryCurve, opts.injuryFactor);
      const injuryAdjustedVOR = riskAdjustedVOR * injuryAdj;

      // 5️⃣ ajuste por semanas de playoff (configurable)
      const playoffWeight = getPlayoffWeight(p, opts.playoffWeeks, opts.playoffWeightFactor);
      const playoffAdjustedVOR = injuryAdjustedVOR * playoffWeight;

      // Dropoff individual (suavizado por ventana)
      const dropoff = positionalDropoffs[i] ?? 0;

      // TierBonus: detecta gap estadístico (z-score) o percentile
      const tierBonus = detectTierGap(dropoff, positionalDropoffs, opts);

      result.push({
        player_id: p.player_id,
        position: p.position,
        vor: Number(vor.toFixed(3)),
        adjustedVOR: Number(adjustedVOR.toFixed(3)),
        riskAdjustedVOR: Number(riskAdjustedVOR.toFixed(3)),
        injuryAdjustedVOR: Number(injuryAdjustedVOR.toFixed(3)),
        playoffAdjustedVOR: Number(playoffAdjustedVOR.toFixed(3)),
        dropoff: Number(dropoff.toFixed(3)),
        tierBonus
      });
    }
  }

  return result;
}

// ----------------- UTILIDADES MEJORADAS -----------------

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function meanWindow(sorted, centerIndex, windowSize, valueFn) {
  if (!sorted || sorted.length === 0) return 0;
  const vals = [];
  for (let off = -windowSize; off <= windowSize; off++) {
    const idx = centerIndex + off;
    if (idx >= 0 && idx < sorted.length) vals.push(valueFn(sorted[idx]));
  }
  if (vals.length === 0) return 0;
  return vals.reduce((s,x)=>s+x,0)/vals.length;
}

// compute dropoff estable: promedio ponderado de gaps en una ventana mayor a N
function computeWeightedDropoffStable(sorted, N, dropoffWindow) {
  if (!sorted || sorted.length < 2) return 0;
  const maxIndex = Math.min(sorted.length - 1, Math.max(N + dropoffWindow, 1));
  let gaps = [];
  for (let i = 0; i < maxIndex; i++) {
    const gap = (sorted[i]?.total_projected || 0) - (sorted[i+1]?.total_projected || 0);
    if (gap > 0) gaps.push(gap);
  }
  if (gaps.length === 0) return 0;
  // usar mediana para reducir influencia de outliers
  return median(gaps);
}

function computePositionalDropoffs(sorted) {
  // devuelve array de dropoff[i] = proj[i] - proj[i+1] (o 0 si último), luego aplica suavizado simple (media móvil)
  if (!sorted || sorted.length === 0) return [];
  const raw = [];
  for (let i = 0; i < sorted.length; i++) {
    const gap = (sorted[i]?.total_projected || 0) - (sorted[i+1]?.total_projected || 0);
    raw.push(gap > 0 ? gap : 0);
  }
  // suavizado por media móvil 3
  const smooth = raw.map((_,i) => {
    const window = [];
    for (let k = Math.max(0,i-1); k <= Math.min(raw.length-1, i+1); k++) window.push(raw[k]);
    return window.reduce((s,x)=>s+x,0)/window.length;
  });
  return smooth;
}

function median(arr) {
  const a = arr.slice().sort((x,y)=>x-y);
  const mid = Math.floor(a.length/2);
  return a.length % 2 === 0 ? (a[mid-1]+a[mid])/2 : a[mid];
}

function mean(arr) {
  if (!arr || arr.length===0) return 0;
  return arr.reduce((s,x)=>s+x,0)/arr.length;
}

function detectTierGap(value, allGaps, opts) {
  // z-score approach
  if (!allGaps || allGaps.length < 3) return false;
  const mu = mean(allGaps);
  const sd = Math.sqrt(mean(allGaps.map(g => Math.pow(g - mu, 2))));
  if (sd > 0) {
    const z = (value - mu) / sd;
    if (z >= opts.tierZThreshold) return true;
  }
  // fallback percentile: is value in top X% of gaps?
  const sortedDesc = [...allGaps].sort((a,b)=>b-a);
  const idx = sortedDesc.indexOf(value);
  if (idx >= 0) {
    const perc = 1 - (idx / Math.max(sortedDesc.length - 1, 1));
    return perc >= opts.tierPercentileThreshold;
  }
  return false;
}

function computeScarcityFactorRobust(pos, startersAtPos, numTeams, avgDropoff, replacementValue, opts) {
  const weight = opts.scarcityWeights[pos] || 1.0;
  // starterShare: qué fracción del pool de titulares son starters en esa posición
  const starterShare = (startersAtPos || 0) / Math.max(numTeams, 1);
  // volatilityFactor: relación entre dropoff y replacement (floor replacementValue para evitar división por cero)
  const denom = Math.max(Math.abs(replacementValue), 1e-6);
  const volatilityFactor = avgDropoff / denom;
  // scarcity raw: escala controlada
  const raw = 1 + (starterShare * weight * volatilityFactor);
  return raw;
}

function getRiskAdjustmentRobust(player, maxRiskPenalty = 0.30) {
  // Coeficiente de variación: stdDev / mean. Usamos floor para denominador y limitamos.
  const stdDev = Number(player.projStdDev || 0);
  const meanProj = Math.max(1e-6, Number(player.total_projected || 1));
  const cov = stdDev / meanProj;
  const penalty = Math.min(cov, maxRiskPenalty); // no más que maxRiskPenalty
  return 1 - penalty;
}

function getInjuryAdjustment(player, injuryCurve = 0.5, injuryFactor = 0.6) {
  // player.injuryRisk as percentage (0..100) OR as decimal (0..1)
  let risk = player.injuryRisk;
  if (typeof risk === 'string') risk = parseFloat(risk);
  if (risk == null) risk = 0;
  if (risk > 1) risk = risk / 100; // convertir %
  // mapping suave: multiplicador = 1 - (risk^curve * factor)
  const multiplier = 1 - (Math.pow(risk, injuryCurve) * injuryFactor);
  return clamp(multiplier, 0.5, 1.0); // nunca bajar de 0.5 (ajustable)
}

function getPlayoffWeight(player, playoffWeeks = [14,15,16], playoffWeightFactor = 0.25) {
  if (!player.weekly_proj || player.weekly_proj.length < Math.max(...playoffWeeks)) return 1;
  let playoffTotal = 0, seasonTotal = 0;
  for (let w = 0; w < player.weekly_proj.length; w++) {
    const pts = Number(player.weekly_proj[w] || 0);
    seasonTotal += pts;
    if (playoffWeeks.includes(w + 1)) playoffTotal += pts;
  }
  if (seasonTotal <= 0) return 1;
  const playoffPct = playoffTotal / seasonTotal;
  // limitamos efecto para no inflar demasiado jugadores con pocos partidos buenos
  return 1 + (playoffPct * playoffWeightFactor);
}

// --- Mantén tus utilidades originales, mejoradas cuando aplica ---
function getStarterCounts(starterPositions) {
  const counts = {};
  for (const pos of starterPositions) {
    if (['QB', 'RB', 'WR', 'TE', 'K', 'DST'].includes(pos)) {
      counts[pos] = (counts[pos] || 0) + 1;
    } else if (pos === 'FLEX') {
      ['RB', 'WR', 'TE'].forEach(p => counts[p] = (counts[p] || 0) + 1/3);
    } else if (pos === 'REC_FLEX') {
      ['WR', 'TE'].forEach(p => counts[p] = (counts[p] || 0) + 1/2);
    } else if (pos === 'SUPER_FLEX') {
      ['QB', 'RB', 'WR', 'TE'].forEach(p => counts[p] = (counts[p] || 0) + 1/4);
    }
  }
  return counts;
}

function groupPlayersByPosition(projections) {
  const buckets = {};
  for (const p of projections) {
    if (!p || !p.position || typeof p.total_projected !== 'number') continue;
    if (!buckets[p.position]) buckets[p.position] = [];
    buckets[p.position].push(p);
  }
  return buckets;
}
