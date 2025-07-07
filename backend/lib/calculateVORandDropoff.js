export function calculateVORandDropoff(projections, starterPositions, numTeams) {
  const positionMap = {};

  projections.forEach(p => {
    const pos = p.position;
    if (!positionMap[pos]) positionMap[pos] = [];
    positionMap[pos].push(p);
  });

  const results = [];

  for (const [pos, players] of Object.entries(positionMap)) {
    players.sort((a, b) => b.total_ppr - a.total_ppr);

    const startersPerTeam = starterPositions.filter(p => p === pos).length;
    const replacementIndex = startersPerTeam * numTeams;
    const replacement = players[replacementIndex] || { total_ppr: 0 };

    for (let i = 0; i < players.length; i++) {
      const player = players[i];
      const nextPlayer = players[i + 1];
      const dropoff = nextPlayer ? player.total_ppr - nextPlayer.total_ppr : 0;

      results.push({
        player_id: player.player_id,
        position: pos,
        total_ppr: player.total_ppr,
        vor: player.total_ppr - replacement.total_ppr,
        dropoff: parseFloat(dropoff.toFixed(2)),
      });
    }
  }

  return results;
}
