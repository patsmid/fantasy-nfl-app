export function calculateVORandDropoffPro(projections = [], starterPositions = [], numTeams = 10, options = {}) {
  const opts = {
    replacementDefaults: { QB: 18, RB: 45, WR: 45, TE: 18, K: 12, DST: 12 },
    replacementOffset: { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 },
    replacementWindow: 2,
    dropoffWindow: 2,
    tierZThreshold: 1.5,
    tierPercentileThreshold: 0.92,
    scarcityWeights: { RB: 2.2, WR: 1.35, QB: 1.4, TE: 1.1, K: 1.0, DST: 1.0 },
    maxScarcityMultiplier: 1.5,
    minScarcityMultiplier: 0.85,
    maxRiskPenalty: 0.30,
    riskAlpha: 2.5,
    injuryCurve: 0.5,
    injuryFactor: 0.5,
    playoffWeightFactor: 0.22,
    playoffWeeks: [14,15,16],
    debug: false,
    ...options
  };

  const starterCounts = getStarterCounts(starterPositions || []);
  const posBuckets = groupPlayersByPosition(projections || []);
  const result = [];

  for (const [pos, list] of Object.entries(posBuckets)) {
    const available = (list || []).filter(p => !p.status || String(p.status).toUpperCase() === 'LIBRE');
    if (!available.length) continue;

    const sorted = [...available].map(p => ({ ...p, total_projected: Number(p.total_projected || 0) }))
                             .sort((a,b) => (b.total_projected || 0) - (a.total_projected || 0));

    const startersAtPos = Number(starterCounts[pos] || 0);
    const teams = Math.max(1, Number(numTeams || 10));
    const N = Math.max(0, Math.floor(startersAtPos * teams));

    // replacement index (zero-based)
    let replacementIndex;
    if (N > 0) {
      replacementIndex = N - 1 + (opts.replacementOffset[pos] || 0);
    } else {
      // fallback: convertir replacementDefaults[pos] (league-level) a índice por equipo
      const leagueDefault = opts.replacementDefaults[pos] || Math.max(3, Math.round(teams * 2));
      replacementIndex = Math.max(0, Math.round(leagueDefault / teams) - 1);
    }
    const boundedIdx = clamp(Math.min(replacementIndex, sorted.length - 1), 0, Math.max(sorted.length - 1, 0));

    const replacementValue = meanWindow(sorted, boundedIdx, opts.replacementWindow, p => Number(p?.total_projected || 0));

    const avgDropoff = computeWeightedDropoffStable(sorted, Math.max(1, N || 1), opts.dropoffWindow);
    const positionalDropoffs = computePositionalDropoffs(sorted);

    // scarcity mapping (no-lineal, saturada)
    const denom = Math.max(Math.abs(replacementValue), 1e-6);
    const volatility = avgDropoff / denom;
    const volMapped = 1 - Math.exp(-Math.max(0, volatility) * 1.2);
    const starterShare = Math.min(1, startersAtPos / teams);
    const rawScarcity = 1 + (volMapped * starterShare * (opts.scarcityWeights[pos] || 1));
    const scarcityFactor = clamp(rawScarcity, opts.minScarcityMultiplier, opts.maxScarcityMultiplier);

    if (opts.debug) {
      console.debug(`[VOR DEBUG] pos=${pos} teams=${teams} startersAtPos=${startersAtPos} N=${N} replIdx=${boundedIdx} replVal=${replacementValue.toFixed(2)} avgDrop=${avgDropoff.toFixed(2)} scarcityFactor=${scarcityFactor.toFixed(3)}`);
    }

    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i];
      const baseProj = Number(p.total_projected || 0);

      const vor = baseProj - replacementValue;
      const adjustedVOR = vor * scarcityFactor;

      // riesgo (forma no lineal)
      const stdDev = Number(p.projStdDev || 0);
      const meanProj = Math.max(1e-6, Number(p.total_projected || 1));
      const cov = stdDev / meanProj;
      const clippedCov = Math.min(cov, opts.maxRiskPenalty);
      const riskAdj = 1 / (1 + (opts.riskAlpha * clippedCov)); // 0..1
      const riskAdjustedVOR = adjustedVOR * riskAdj;

      // lesión (injuryRisk decimal esperado 0..1)
      let injuryRisk = Number(p.injuryRisk ?? 0);
      if (injuryRisk > 1) injuryRisk = injuryRisk / 100;
      injuryRisk = Math.max(0, Math.min(1, injuryRisk));
      const injuryAdj = clamp(1 - (Math.pow(injuryRisk, opts.injuryCurve) * opts.injuryFactor), 0.65, 1.0);
      const injuryAdjustedVOR = riskAdjustedVOR * injuryAdj;

      // semanas de playoff
      const playoffWeight = getPlayoffWeight(p, opts.playoffWeeks, opts.playoffWeightFactor);
      const playoffAdjustedVOR = injuryAdjustedVOR * playoffWeight;

      const dropoff = positionalDropoffs[i] ?? 0;
      const tierBonus = detectTierGap(dropoff, positionalDropoffs, opts);

      // push resultados (valores numéricos garantizados)
      result.push({
        player_id: p.player_id != null ? String(p.player_id) : null,
        position: p.position || pos,
        vor: safeNumber(vor, 3),
        adjustedVOR: safeNumber(adjustedVOR, 3),
        riskAdjustedVOR: safeNumber(riskAdjustedVOR, 3),
        injuryAdjustedVOR: safeNumber(injuryAdjustedVOR, 3),
        playoffAdjustedVOR: safeNumber(playoffAdjustedVOR, 3),
        dropoff: safeNumber(dropoff, 3),
        tierBonus: !!tierBonus
      });
    }
  }

  return result;
}

export function addEstimatedStdDev(projections = []) {
  const positionVariancePct = { QB:0.06, RB:0.12, WR:0.10, TE:0.15, K:0.25, DST:0.25 };
  const positionInjuryRiskPct = { QB:0.07, RB:0.28, WR:0.20, TE:0.25, K:0.05, DST:0.05 };

  return (projections || []).map(p => {
    const safeTotal = Number(p.total_projected || 0);
    const varPct = positionVariancePct[p.position] ?? 0.10;
    const stdDev = Math.max(0, safeTotal * varPct);
    const injuryRiskPct = positionInjuryRiskPct[p.position] ?? 0.10;
    const injuryRiskDecimal = Math.max(0, Math.min(1, injuryRiskPct)); // 0..1

    return {
      ...p,
      total_projected: safeTotal,
      projStdDev: Number(stdDev.toFixed(2)),
      injuryRisk: Number(injuryRiskDecimal.toFixed(3)), // guardamos decimal 0..1
      injuryAdj: Number((1 - (injuryRiskDecimal * 0.5)).toFixed(3)) // backward compatible
    };
  });
}

/* ------------------ UTILIDADES ------------------ */

function safeNumber(v, decimals=2) {
  const n = Number(v || 0);
  return Number(n.toFixed(decimals));
}

function clamp(v,a,b) { return Math.max(a, Math.min(b, v)); }

function meanWindow(sorted, centerIndex, windowSize, valueFn) {
  if (!Array.isArray(sorted) || !sorted.length) return 0;
  const vals = [];
  for (let off = -windowSize; off <= windowSize; off++) {
    const idx = centerIndex + off;
    if (idx >= 0 && idx < sorted.length) vals.push(Number(valueFn(sorted[idx]) || 0));
  }
  return vals.length ? (vals.reduce((s,x)=>s+x,0)/vals.length) : 0;
}

function computeWeightedDropoffStable(sorted, N = 1, dropoffWindow = 2) {
  if (!Array.isArray(sorted) || sorted.length < 2) return 0;
  const maxIndex = Math.min(sorted.length-1, Math.max(N + dropoffWindow, 1));
  const gaps = [];
  for (let i = 0; i < maxIndex; i++) {
    const gap = Number(sorted[i]?.total_projected || 0) - Number(sorted[i+1]?.total_projected || 0);
    if (gap > 0) gaps.push(gap);
  }
  return gaps.length ? median(gaps) : 0;
}

function computePositionalDropoffs(sorted) {
  if (!Array.isArray(sorted) || !sorted.length) return [];
  const raw = sorted.map((p,i) => {
    const gap = Number(p.total_projected || 0) - Number(sorted[i+1]?.total_projected || 0);
    return gap > 0 ? gap : 0;
  });
  // media móvil 3
  return raw.map((_, i) => {
    const win = [];
    for (let k = Math.max(0,i-1); k <= Math.min(raw.length-1, i+1); k++) win.push(raw[k]);
    return win.reduce((s,x)=>s+x,0) / win.length;
  });
}

function median(arr=[]) {
  if (!arr || !arr.length) return 0;
  const a = arr.slice().sort((x,y)=>x-y);
  const mid = Math.floor(a.length/2);
  return a.length % 2 === 0 ? (a[mid-1]+a[mid])/2 : a[mid];
}

function mean(arr) {
  if (!arr || !arr.length) return 0;
  return arr.reduce((s,x)=>s+x,0)/arr.length;
}

function detectTierGap(value, allGaps = [], opts = {}) {
  if (!Array.isArray(allGaps) || allGaps.length < 3) return false;
  const mu = mean(allGaps);
  const sd = Math.sqrt(mean(allGaps.map(g=>Math.pow(g-mu,2))));
  if (sd > 0 && ((value - mu)/sd) >= (opts.tierZThreshold || 1.5)) return true;
  const sortedDesc = [...allGaps].sort((a,b)=>b-a);
  const idx = sortedDesc.indexOf(value);
  if (idx >= 0) {
    const perc = 1 - (idx / Math.max(sortedDesc.length-1,1));
    return perc >= (opts.tierPercentileThreshold || 0.92);
  }
  return false;
}

function getPlayoffWeight(player, playoffWeeks=[14,15,16], playoffWeightFactor=0.22) {
  if (!player || !Array.isArray(player.weekly_proj) || player.weekly_proj.length === 0) return 1;
  const maxWeek = Math.max(...playoffWeeks);
  if (player.weekly_proj.length < maxWeek) return 1;
  let playoffTotal = 0, seasonTotal = 0;
  for (let w = 0; w < player.weekly_proj.length; w++) {
    const pts = Number(player.weekly_proj[w] || 0);
    seasonTotal += pts;
    if (playoffWeeks.includes(w + 1)) playoffTotal += pts;
  }
  if (seasonTotal <= 0) return 1;
  const pct = playoffTotal / seasonTotal;
  // cap para evitar inflar demasiados jugadores
  return 1 + Math.min(0.7, pct) * playoffWeightFactor;
}

function getStarterCounts(starterPositions = []) {
  const counts = {};
  for (const pos of starterPositions || []) {
    if (['QB','RB','WR','TE','K','DST'].includes(pos)) counts[pos] = (counts[pos] || 0) + 1;
    else if (pos === 'FLEX') ['RB','WR','TE'].forEach(p => counts[p] = (counts[p] || 0) + 1/3);
    else if (pos === 'REC_FLEX') ['WR','TE'].forEach(p => counts[p] = (counts[p] || 0) + 1/2);
    else if (pos === 'SUPER_FLEX') ['QB','RB','WR','TE'].forEach(p => counts[p] = (counts[p] || 0) + 1/4);
  }
  return counts;
}

function groupPlayersByPosition(projections = []) {
  const buckets = {};
  for (const p of (projections || [])) {
    if (!p || !p.position) continue;
    const tp = Number(p.total_projected || p.total || 0);
    if (Number.isNaN(tp)) continue;
    if (!buckets[p.position]) buckets[p.position] = [];
    buckets[p.position].push({ ...p, total_projected: tp });
  }
  return buckets;
}
