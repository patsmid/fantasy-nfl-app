export function generateLineup(players, starterPositions) {
  const starters = [];
  const bench = [];

  const positionCounts = {};
  for (const pos of starterPositions) {
    positionCounts[pos] = (positionCounts[pos] || 0) + 1;
  }

  const used = new Set();

  // Coloca titulares
  for (const pos of starterPositions) {
    const eligible = players.filter(
      (p, idx) =>
        !used.has(idx) &&
        (pos === 'SUPER_FLEX'
          ? ['QB', 'RB', 'WR', 'TE'].includes(p.position)
          : p.position === pos)
    );

    if (eligible.length > 0) {
      const pick = eligible[0];
      starters.push([
        pick.rank,
        pick.nombre,
        pick.position,
        pick.team,
        pick.matchup,
        pick.byeWeek,
        pick.injuryStatus,
        pick.sleeperId
      ]);
      used.add(players.indexOf(pick));
    } else {
      starters.push(['—', 'Vacío', pos, '', '', '', '', '']);
    }
  }

  // Lo demás a la banca
  players.forEach((p, idx) => {
    if (!used.has(idx)) {
      bench.push([
        p.rank,
        p.nombre,
        p.position,
        p.team,
        p.matchup,
        p.byeWeek,
        p.injuryStatus,
        p.sleeperId
      ]);
    }
  });

  return [starters, bench];
}
