// vorUtils.js

export function calculateVORandDropoff(projections, starterPositions, numTeams) {
  const replacementDefaults = {
    QB: 18, RB: 45, WR: 45, TE: 18, K: 12, DST: 12
  };

  const starterCounts = getStarterCounts(starterPositions);
  const posBuckets = groupPlayersByPosition(projections);
  const result = [];

  for (const [pos, list] of Object.entries(posBuckets)) {
    const available = list.filter(p => p.status === 'LIBRE' || !p.status);
    const sorted = [...available].sort((a, b) => b.total_projected - a.total_projected);

    const N = starterCounts[pos]
      ? Math.round(starterCounts[pos] * numTeams)
      : replacementDefaults[pos] || numTeams;

    const replacementIndex = Math.min(N, sorted.length - 1);
    const replacementValue = sorted[replacementIndex]?.total_projected || 0;

    const avgDropoff = computeAverageDropoff(sorted, N);
    const scarcityFactor = computeScarcityFactor(pos, starterCounts[pos], numTeams, avgDropoff, replacementValue);

    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const vor = p.total_projected - replacementValue;
      const dropoff = (i + 1 < list.length) ? p.total_projected - list[i + 1].total_projected : 0;

      const riskAdjustment = getRiskAdjustment(p);
      const positionWeight = getPositionWeight(pos);

      const adjustedVOR = (p.status === 'LIBRE' || !p.status)
        ? Number((vor * scarcityFactor * riskAdjustment * positionWeight).toFixed(2))
        : 0;

      result.push({
        player_id: p.player_id,
        vor: Number(vor.toFixed(2)),
        adjustedVOR,
        dropoff: Number(dropoff.toFixed(2)),
        tierBonus: dropoff > avgDropoff * 1.25
      });
    }
  }

  return result;
}

export function addEstimatedStdDev(projections) {
  const positionVariancePct = {
    QB: 0.06, RB: 0.12, WR: 0.10, TE: 0.15, K: 0.25, DST: 0.25
  };

  return projections.map(p => {
    const pct = positionVariancePct[p.position] || 0.10;
    const stdDev = p.total_projected ? p.total_projected * pct : 0;
    return {
      ...p,
      projStdDev: Number(stdDev.toFixed(2))
    };
  });
}

// --- AUXILIAR FUNCTIONS ---

function getStarterCounts(starterPositions) {
  const counts = {};

  for (const pos of starterPositions) {
    if (['QB', 'RB', 'WR', 'TE', 'K', 'DST'].includes(pos)) {
      counts[pos] = (counts[pos] || 0) + 1;
    } else if (pos === 'FLEX') {
      ['RB', 'WR', 'TE'].forEach(p => {
        counts[p] = (counts[p] || 0) + 1 / 3;
      });
    } else if (pos === 'REC_FLEX') {
      ['WR', 'TE'].forEach(p => {
        counts[p] = (counts[p] || 0) + 1 / 2;
      });
    } else if (pos === 'SUPER_FLEX') {
      ['QB', 'RB', 'WR', 'TE'].forEach(p => {
        counts[p] = (counts[p] || 0) + 1 / 4;
      });
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

function computeAverageDropoff(sorted, N) {
  let totalDrop = 0;
  for (let i = 1; i < Math.min(N, sorted.length); i++) {
    totalDrop += sorted[i - 1].total_projected - sorted[i].total_projected;
  }
  return totalDrop / Math.max(N - 1, 1);
}

function computeScarcityFactor(pos, startersAtPos, numTeams, avgDropoff, replacementValue) {
  const scarcityWeights = {
    RB: 2.0,
    WR: 1.4,
    QB: 1.7,
    TE: 1.2,
    K: 1.0,
    DST: 1.0
  };
  const weight = scarcityWeights[pos] || 1.0;
  const starterShare = (startersAtPos || 1) / numTeams;
  const volatilityFactor = avgDropoff / (replacementValue || 1);

  return 1 + (starterShare * weight * volatilityFactor);
}

function getRiskAdjustment(player) {
  const stdDev = player.projStdDev || 0;
  const base = player.total_projected || 1;
  const varCoef = stdDev / base;
  return 1 - Math.min(varCoef, 0.3); // máximo penalización del 30%
}

function getPositionWeight(pos) {
  const weights = {
    QB: 0.9,
    RB: 1.05,
    WR: 1.0,
    TE: 1.1,
    K: 1.0,
    DST: 1.0
  };
  return weights[pos] || 1.0;
}
