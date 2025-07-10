export function calculateVORandDropoff(projections, starterPositions, numTeams) {
  const starterCounts = {};

  for (const pos of starterPositions) {
    // Posiciones normales
    if (['QB', 'RB', 'WR', 'TE', 'K', 'DST'].includes(pos)) {
      starterCounts[pos] = (starterCounts[pos] || 0) + 1;
    }

    // Posiciones flexibles
    else if (pos === 'FLEX') {
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
    const replacementIndex = Math.min(N - 1, sorted.length - 1);
    const replacementValue = sorted[replacementIndex]?.total_projected || 0;

    const scarcityFactor = 1 + ((starterCounts[pos] || 0) / numTeams);

    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const vor = p.total_projected - replacementValue;
      const dropoff = i + 1 < list.length
        ? list[i].total_projected - list[i + 1].total_projected
        : 0;

      result.push({
        player_id: p.player_id,
        vor: Number(vor.toFixed(2)),
        adjustedVOR: (p.status === 'LIBRE' || !p.status)
          ? Number((vor * scarcityFactor).toFixed(2))
          : 0,
        dropoff: Number(dropoff.toFixed(2)),
      });
    }
  }

  return result;
}
