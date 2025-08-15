// vorUtils.optimized.js
// Versión optimizada de calculateVORandDropoffPro + utilidades

export function calculateVORandDropoffPro(projections, starterPositions, numTeams, options = {}) {
  const opts = {
    replacementDefaults: { QB: 18, RB: 45, WR: 45, TE: 18, K: 12, DST: 12 },
    replacementOffset: { QB: 0, RB: 3, WR: 3, TE: 1, K: 0, DST: 0 },
    replacementWindow: 3,
    dropoffWindow: 3,
    tierZThreshold: 1.5,
    tierPercentileThreshold: 0.90,
    scarcityWeights: { RB: 2.0, WR: 1.4, QB: 1.7, TE: 1.2, K: 1.0, DST: 1.0 },
    maxScarcityMultiplier: 1.6,
    minScarcityMultiplier: 0.7,
    maxRiskPenalty: 0.30,
    injuryCurve: 0.5,
    injuryFactor: 0.6,
    playoffWeightFactor: 0.25,
    playoffWeeks: [14,15,16],
    ...options
  };

  const starterCounts = getStarterCounts(starterPositions);
  const posBuckets = groupPlayersByPosition(projections);
  const result = [];

  for (const [pos, list] of Object.entries(posBuckets)) {
    const available = list.filter(p => !p.status || p.status === 'LIBRE');
    if (!available.length) continue;

    const sorted = [...available].sort((a,b) => (b.total_projected || 0) - (a.total_projected || 0));
    const startersAtPos = starterCounts[pos] || 0;
    const N = Math.max(0, Math.floor(startersAtPos * numTeams));
    const baseReplacementIndex = N + (opts.replacementOffset[pos] || 0);
    const boundedIndex = clamp(baseReplacementIndex, 0, sorted.length - 1);

    const replacementValue = meanWindow(sorted, boundedIndex, opts.replacementWindow, p => p.total_projected || 0);
    const avgDropoff = computeWeightedDropoffStable(sorted, Math.max(1,N), opts.dropoffWindow);
    const scarcityFactor = clamp(
      computeScarcityFactorRobust(pos, startersAtPos, numTeams, avgDropoff, replacementValue, opts),
      opts.minScarcityMultiplier,
      opts.maxScarcityMultiplier
    );

    const positionalDropoffs = computePositionalDropoffs(sorted);

    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i];
      const baseProj = Number(p.total_projected || 0);

      const vor = baseProj - replacementValue;
      const adjustedVOR = vor * scarcityFactor;
      const riskAdjustedVOR = adjustedVOR * getRiskAdjustmentRobust(p, opts.maxRiskPenalty);
      const injuryAdjustedVOR = riskAdjustedVOR * getInjuryAdjustment(p, opts.injuryCurve, opts.injuryFactor);
      const playoffAdjustedVOR = injuryAdjustedVOR * getPlayoffWeight(p, opts.playoffWeeks, opts.playoffWeightFactor);

      const dropoff = positionalDropoffs[i] ?? 0;
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

// ----------------- UTILIDADES -----------------
function clamp(v,a,b) { return Math.max(a, Math.min(b,v)); }

function meanWindow(sorted, centerIndex, windowSize, valueFn) {
  if (!sorted || !sorted.length) return 0;
  const vals = [];
  for (let off = -windowSize; off <= windowSize; off++) {
    const idx = centerIndex + off;
    if (idx >= 0 && idx < sorted.length) vals.push(valueFn(sorted[idx]));
  }
  return vals.length ? vals.reduce((s,x)=>s+x,0)/vals.length : 0;
}

function computeWeightedDropoffStable(sorted, N, dropoffWindow) {
  if (!sorted || sorted.length < 2) return 0;
  const maxIndex = Math.min(sorted.length-1, Math.max(N+dropoffWindow,1));
  const gaps = [];
  for (let i = 0; i < maxIndex; i++) {
    const gap = (sorted[i]?.total_projected || 0) - (sorted[i+1]?.total_projected || 0);
    if (gap > 0) gaps.push(gap);
  }
  return gaps.length ? median(gaps) : 0;
}

function computePositionalDropoffs(sorted) {
  const raw = sorted.map((p,i) => {
    const gap = (p.total_projected || 0) - (sorted[i+1]?.total_projected || 0);
    return gap > 0 ? gap : 0;
  });
  return raw.map((_,i) => {
    const window = [];
    for (let k = Math.max(0,i-1); k <= Math.min(raw.length-1,i+1); k++) window.push(raw[k]);
    return window.reduce((s,x)=>s+x,0)/window.length;
  });
}

function median(arr) {
  const a = arr.slice().sort((x,y)=>x-y);
  const mid = Math.floor(a.length/2);
  return arr.length%2===0 ? (a[mid-1]+a[mid])/2 : a[mid];
}

function mean(arr) {
  if (!arr || !arr.length) return 0;
  return arr.reduce((s,x)=>s+x,0)/arr.length;
}

function detectTierGap(value, allGaps, opts) {
  if (!allGaps || allGaps.length < 3) return false;
  const mu = mean(allGaps);
  const sd = Math.sqrt(mean(allGaps.map(g=>Math.pow(g-mu,2))));
  if (sd > 0 && ((value - mu)/sd) >= opts.tierZThreshold) return true;

  const sortedDesc = [...allGaps].sort((a,b)=>b-a);
  const idx = sortedDesc.indexOf(value);
  if (idx >= 0) {
    const perc = 1 - (idx / Math.max(sortedDesc.length-1,1));
    return perc >= opts.tierPercentileThreshold;
  }
  return false;
}

function computeScarcityFactorRobust(pos, startersAtPos, numTeams, avgDropoff, replacementValue, opts) {
  const weight = opts.scarcityWeights[pos] || 1.0;
  const starterShare = (startersAtPos || 0)/Math.max(numTeams,1);
  const denom = Math.max(Math.abs(replacementValue), 1e-6);
  return 1 + (starterShare * weight * (avgDropoff / denom));
}

function getRiskAdjustmentRobust(player, maxRiskPenalty=0.3) {
  const stdDev = Number(player.projStdDev || 0);
  const meanProj = Math.max(1e-6, Number(player.total_projected || 1));
  const cov = stdDev / meanProj;
  return 1 - Math.min(cov, maxRiskPenalty);
}

function getInjuryAdjustment(player, injuryCurve=0.5, injuryFactor=0.6) {
  let risk = player.injuryRisk;
  if (typeof risk === 'string') risk = parseFloat(risk);
  if (!risk) risk = 0;
  if (risk > 1) risk = risk/100;
  return clamp(1 - (Math.pow(risk, injuryCurve) * injuryFactor), 0.5, 1);
}

function getPlayoffWeight(player, playoffWeeks=[14,15,16], playoffWeightFactor=0.25) {
  if (!player.weekly_proj || !player.weekly_proj.length) return 1;
  let playoffTotal=0, seasonTotal=0;
  for (let w=0; w<player.weekly_proj.length; w++) {
    const pts = Number(player.weekly_proj[w]||0);
    seasonTotal += pts;
    if (playoffWeeks.includes(w+1)) playoffTotal += pts;
  }
  if (seasonTotal <= 0) return 1;
  const pct = playoffTotal/seasonTotal;
  return 1 + (pct*playoffWeightFactor);
}

// --- utilidades adicionales ---
function getStarterCounts(starterPositions) {
  const counts = {};
  for (const pos of starterPositions) {
    if (['QB','RB','WR','TE','K','DST'].includes(pos)) counts[pos]=(counts[pos]||0)+1;
    else if (pos==='FLEX') ['RB','WR','TE'].forEach(p=>counts[p]=(counts[p]||0)+1/3);
    else if (pos==='REC_FLEX') ['WR','TE'].forEach(p=>counts[p]=(counts[p]||0)+1/2);
    else if (pos==='SUPER_FLEX') ['QB','RB','WR','TE'].forEach(p=>counts[p]=(counts[p]||0)+1/4);
  }
  return counts;
}

function groupPlayersByPosition(projections) {
  const buckets={};
  for (const p of projections) {
    if (!p || !p.position || typeof p.total_projected!=='number') continue;
    if (!buckets[p.position]) buckets[p.position]=[];
    buckets[p.position].push(p);
  }
  return buckets;
}

// --- Añadimos la función optimizada de addEstimatedStdDev ---
export function addEstimatedStdDev(projections) {
  const positionVariancePct = { QB:0.06,RB:0.12,WR:0.10,TE:0.15,K:0.25,DST:0.25 };
  const positionInjuryRiskPct = { QB:0.07,RB:0.28,WR:0.20,TE:0.25,K:0.05,DST:0.05 };

  return projections.map(p => {
    const varPct = positionVariancePct[p.position] ?? 0.10;
    const stdDev = p.total_projected ? p.total_projected * varPct : 0;

    const injuryRisk = positionInjuryRiskPct[p.position] ?? 0.10;
    const injuryAdj = 1 - (injuryRisk*0.5);

    return {
      ...p,
      projStdDev: Number(stdDev.toFixed(2)),
      injuryRisk: Number((injuryRisk*100).toFixed(1)),
      injuryAdj: Number(injuryAdj.toFixed(3))
    };
  });
}
