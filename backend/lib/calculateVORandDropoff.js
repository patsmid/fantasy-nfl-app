export function calculateVORandDropoff(projections, starterPositions, numTeams) {
  const starterCounts = {};
  for (const pos of starterPositions) {
    if (!starterCounts[pos]) starterCounts[pos] = 0;
    starterCounts[pos]++;
  }

  const posBuckets = {};
  for (const p of projections) {
    if (!p || !p.position || typeof p.total_ppr !== 'number') continue;
    if (!posBuckets[p.position]) posBuckets[p.position] = [];
    posBuckets[p.position].push(p);
  }

  const result = [];

  for (const [pos, list] of Object.entries(posBuckets)) {
    const libres = list.filter(p => p.status === 'LIBRE' || !p.status);
    const sorted = libres.sort((a, b) => b.total_ppr - a.total_ppr);

    const N = starterCounts[pos] ? starterCounts[pos] * numTeams : numTeams;
    const replacementIndex = Math.min(N - 1, sorted.length - 1);
    const replacementValue = sorted[replacementIndex]?.total_ppr || 0;

    const scarcityFactor = 1 + ((starterCounts[pos] || 0) / numTeams);

    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i];
      const vor = p.total_ppr - replacementValue;
      const adjustedVOR = vor * scarcityFactor;
      const dropoff = i + 1 < sorted.length
        ? sorted[i].total_ppr - sorted[i + 1].total_ppr
        : 0;

      result.push({
        player_id: p.player_id,
        vor: Number(adjustedVOR.toFixed(2)),
        dropoff: Number(dropoff.toFixed(2))
      });
    }
  }

  return result;
}
