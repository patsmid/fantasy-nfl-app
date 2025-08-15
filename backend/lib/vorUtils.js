export function calculateVORandDropoffPro(projections, starterPositions, numTeams) {
  const replacementDefaults = { QB: 18, RB: 45, WR: 45, TE: 18, K: 12, DST: 12 };
  const replacementOffset = { QB: 0, RB: 3, WR: 3, TE: 1, K: 0, DST: 0 };

  const starterCounts = getStarterCounts(starterPositions);
  const posBuckets = groupPlayersByPosition(projections);
  const result = [];

  for (const [pos, list] of Object.entries(posBuckets)) {
    const available = list.filter(p => p.status === 'LIBRE' || !p.status);
    const sorted = [...available].sort((a, b) => b.total_projected - a.total_projected);

    const N = starterCounts[pos]
      ? Math.round(starterCounts[pos] * numTeams)
      : replacementDefaults[pos] || numTeams;

    const replacementIndex = Math.min(
      N + (replacementOffset[pos] || 0),
      sorted.length - 1
    );

    const replacementValue = sorted[replacementIndex]?.total_projected || 0;
    const avgDropoff = computeWeightedDropoff(sorted, N);
    const scarcityFactor = computeScarcityFactor(pos, starterCounts[pos], numTeams, avgDropoff, replacementValue);

    for (let i = 0; i < list.length; i++) {
      const p = list[i];

      // 1️⃣ VOR puro
      const vor = p.total_projected - replacementValue;

      // 2️⃣ Ajuste por escasez
      const adjustedVOR = vor * scarcityFactor;

      // 3️⃣ Ajuste por riesgo (consistencia)
      const riskAdjustment = getRiskAdjustment(p);
      const riskAdjustedVOR = adjustedVOR * riskAdjustment;

      // 4️⃣ Ajuste por riesgo de lesión
      const injuryAdjustedVOR = riskAdjustedVOR * (p.injuryAdj || 1);

      // 5️⃣ Ajuste por semanas de playoff
      const playoffWeight = getPlayoffWeight(p);
      const playoffAdjustedVOR = injuryAdjustedVOR * playoffWeight;

      // Dropoff individual
      const dropoff = (i + 1 < list.length)
        ? p.total_projected - list[i + 1].total_projected
        : 0;

      result.push({
        player_id: p.player_id,
        position: p.position,
        vor: Number(vor.toFixed(2)),
        adjustedVOR: Number(adjustedVOR.toFixed(2)),
        riskAdjustedVOR: Number(riskAdjustedVOR.toFixed(2)),
        injuryAdjustedVOR: Number(injuryAdjustedVOR.toFixed(2)),
        playoffAdjustedVOR: Number(playoffAdjustedVOR.toFixed(2)),
        dropoff: Number(dropoff.toFixed(2)),
        tierBonus: dropoff > avgDropoff * 1.25
      });
    }
  }

  return result;
}

// --- AUXILIARES ---

function computeWeightedDropoff(sorted, N) {
  let totalDrop = 0, weightSum = 0;
  for (let i = 1; i < Math.min(N, sorted.length); i++) {
    const weight = (N - i + 1) / N; // más peso a los primeros picks
    totalDrop += (sorted[i - 1].total_projected - sorted[i].total_projected) * weight;
    weightSum += weight;
  }
  return totalDrop / Math.max(weightSum, 1);
}

function getPlayoffWeight(player) {
  if (!player.weekly_proj || player.weekly_proj.length < 17) return 1;
  const playoffWeeks = [14, 15, 16]; // ajusta según tu liga
  let playoffTotal = 0, seasonTotal = 0;
  for (let w = 0; w < player.weekly_proj.length; w++) {
    const pts = player.weekly_proj[w] || 0;
    seasonTotal += pts;
    if (playoffWeeks.includes(w + 1)) {
      playoffTotal += pts;
    }
  }
  const playoffPct = playoffTotal / Math.max(seasonTotal, 1);
  return 1 + (playoffPct * 0.25);
}

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

function computeScarcityFactor(pos, startersAtPos, numTeams, avgDropoff, replacementValue) {
  const scarcityWeights = { RB: 2.0, WR: 1.4, QB: 1.7, TE: 1.2, K: 1.0, DST: 1.0 };
  const weight = scarcityWeights[pos] || 1.0;
  const starterShare = (startersAtPos || 1) / numTeams;
  const volatilityFactor = avgDropoff / (replacementValue || 1);
  return 1 + (starterShare * weight * volatilityFactor);
}

function getRiskAdjustment(player) {
  const stdDev = player.projStdDev || 0;
  const base = player.total_projected || 1;
  const varCoef = stdDev / base;
  return 1 - Math.min(varCoef, 0.3); // máx. penalización 30%
}

// --- STDDEV + RIESGO DE LESIÓN ---
export function addEstimatedStdDev(projections) {
  const positionVariancePct = {
    QB: 0.06, RB: 0.12, WR: 0.10, TE: 0.15, K: 0.25, DST: 0.25
  };

  const positionInjuryRiskPct = {
    QB: 0.07, RB: 0.28, WR: 0.20, TE: 0.25, K: 0.05, DST: 0.05
  };

  return projections.map(p => {
    const varPct = positionVariancePct[p.position] || 0.10;
    const stdDev = p.total_projected ? p.total_projected * varPct : 0;

    const injuryRisk = positionInjuryRiskPct[p.position] || 0.10;
    const injuryAdj = 1 - (injuryRisk * 0.5);

    return {
      ...p,
      projStdDev: Number(stdDev.toFixed(2)),
      injuryRisk: Number((injuryRisk * 100).toFixed(1)), // %
      injuryAdj: Number(injuryAdj.toFixed(3)) // multiplicador
    };
  });
}
