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
    const sortedLibres = [...libres].sort((a, b) => b.total_ppr - a.total_ppr);

    const N = starterCounts[pos] ? starterCounts[pos] * numTeams : numTeams;
    const replacementIndex = Math.min(N - 1, sortedLibres.length - 1);
    const replacementValue = sortedLibres[replacementIndex]?.total_ppr || 0;

    const scarcityFactor = 1 + ((starterCounts[pos] || 0) / numTeams);

    for (const p of list) {
      const vor = p.total_ppr - replacementValue;

      // Si está en la lista de libres, calculamos adjustedVOR y dropoff
      const isLibre = p.status === 'LIBRE' || !p.status;
      const adjustedVOR = isLibre ? vor * scarcityFactor : 0;

      // Solo calculamos dropoff si es LIBRE y está ordenado
      let dropoff = 0;
      if (isLibre) {
        const index = sortedLibres.findIndex(pl => pl.player_id === p.player_id);
        if (index >= 0 && index + 1 < sortedLibres.length) {
          dropoff = sortedLibres[index].total_ppr - sortedLibres[index + 1].total_ppr;
        }
      }

      result.push({
        player_id: p.player_id,
        vor: Number(vor.toFixed(2)),
        adjustedVOR: Number(adjustedVOR.toFixed(2)),
        dropoff: Number(dropoff.toFixed(2))
      });
    }
  }

  return result;
}
