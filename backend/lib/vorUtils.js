export function calculateVORandDropoff(projections, starterPositions, numTeams) {
  const starterCounts = {};

  for (const pos of starterPositions) {
    if (['QB', 'RB', 'WR', 'TE', 'K', 'DST'].includes(pos)) {
      starterCounts[pos] = (starterCounts[pos] || 0) + 1;
    } else if (pos === 'FLEX') {
      ['RB', 'WR', 'TE'].forEach(p => {
        starterCounts[p] = (starterCounts[p] || 0) + 1 / 3;
      });
    } else if (pos === 'REC_FLEX') {
      ['WR', 'TE'].forEach(p => {
        starterCounts[p] = (starterCounts[p] || 0) + 1 / 2;
      });
    } else if (pos === 'SUPER_FLEX') {
      ['QB', 'RB', 'WR', 'TE'].forEach(p => {
        starterCounts[p] = (starterCounts[p] || 0) + 1 / 4;
      });
    }
  }

  const posBuckets = {};
  for (const p of projections) {
    if (!p || !p.position || typeof p.total_projected !== 'number') continue;
    if (!posBuckets[p.position]) posBuckets[p.position] = [];
    posBuckets[p.position].push(p);
  }

  const result = [];

  for (const [pos, list] of Object.entries(posBuckets)) {
    const libres = list.filter(p => p.status === 'LIBRE' || !p.status);
    const sorted = libres.sort((a, b) => b.total_projected - a.total_projected);

    const N = starterCounts[pos] ? Math.round(starterCounts[pos] * numTeams) : numTeams;
    const replacementIndex = Math.min(N, sorted.length - 1); // VORP: el siguiente al último titular
    const replacementValue = sorted[replacementIndex]?.total_projected || 0;

    // Scarcity factor ajustado por posición
    const posScarcityFactor = {
      RB: 2.0,
      WR: 1.4,
      QB: 1.7,
      TE: 1.2,
      K: 1.0,
      DST: 1.0
    }[pos] || 1.0;

    const baseScarcity = (starterCounts[pos] || 1) / numTeams;

    // Calculamos avg dropoff entre top N
    let avgDropoff = 0;
    for (let i = 1; i < Math.min(N, sorted.length); i++) {
      avgDropoff += sorted[i - 1].total_projected - sorted[i].total_projected;
    }
    avgDropoff = avgDropoff / (N - 1 || 1);

    const scarcityFactor = 1 + baseScarcity * posScarcityFactor * (avgDropoff / (replacementValue || 1));

    // Loop con ajustes
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const vor = p.total_projected - replacementValue;

      const dropoff = (i + 1 < list.length)
        ? p.total_projected - list[i + 1].total_projected
        : 0;

      // Penalización por varianza si existe
      const stdDev = p.projStdDev || 0;
      const varCoef = p.total_projected ? stdDev / p.total_projected : 0;
      const riskAdj = 1 - Math.min(varCoef, 0.3); // Máx penalización: -30%

      const adjustedVOR = (p.status === 'LIBRE' || !p.status)
        ? Number((vor * scarcityFactor * riskAdj).toFixed(2))
        : 0;

      result.push({
        player_id: p.player_id,
        vor: Number(vor.toFixed(2)),
        adjustedVOR,
        dropoff: Number(dropoff.toFixed(2)),
        tierBonus: dropoff > avgDropoff * 1.25, // umbral dinámico
      });
    }
  }

  return result;
}

export function addEstimatedStdDev(projections) {
  const positionVariancePct = {
    QB: 0.06,    // 6% para QBs
    RB: 0.12,    // 12% para RBs
    WR: 0.10,    // 10% para WRs
    TE: 0.15,    // 15% para TEs
    K: 0.25,     // 25% para Kickers
    DST: 0.25    // 25% para Defensas
  };

  return projections.map(p => {
    const pct = positionVariancePct[p.position] || 0.10; // valor por defecto
    const stdDev = p.total_projected ? p.total_projected * pct : 0;

    return {
      ...p,
      projStdDev: Number(stdDev.toFixed(2))
    };
  });
}
