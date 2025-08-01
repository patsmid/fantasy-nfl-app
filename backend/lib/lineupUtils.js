// generateLineup.js

export function generateLineup(players, starterPositions) {
  const qbs = players.filter(p => p.position === 'QB');
  const rbs = players.filter(p => p.position === 'RB');
  const wrs = players.filter(p => p.position === 'WR');
  const tes = players.filter(p => p.position === 'TE');
  const defs = players.filter(p => p.position === 'DEF');
  const ks = players.filter(p => p.position === 'K');

  const flex = players.filter(p => ['RB', 'WR', 'TE'].includes(p.position));
  const sflex = players.filter(p => ['RB', 'WR', 'TE', 'QB'].includes(p.position));
  const wrrb = players.filter(p => ['RB', 'WR'].includes(p.position));
  const recflex = players.filter(p => ['WR', 'TE'].includes(p.position));

  let starters = [];
  const usedIds = new Set();

  for (const starterPosition of starterPositions) {
    let selected;
    switch (starterPosition) {
      case 'QB':
        selected = qbs.shift();
        break;
      case 'RB':
        selected = rbs.shift();
        break;
      case 'WR':
        selected = wrs.shift();
        break;
      case 'TE':
        selected = tes.shift();
        break;
      case 'DEF':
        selected = defs.shift() || createEmptySlot('DEF');
        break;
      case 'K':
        selected = ks.shift() || createEmptySlot('K');
        break;
      case 'WRRB_FLEX':
        selected = firstAvailable(wrrb, usedIds);
        break;
      case 'FLEX':
        selected = firstAvailable(flex, usedIds);
        break;
      case 'REC_FLEX':
        selected = firstAvailable(recflex, usedIds);
        break;
      case 'SUPER_FLEX':
        selected = firstAvailable(sflex, usedIds);
        break;
      default:
        break;
    }

    if (selected && selected.sleeperId !== 'N/D') {
      usedIds.add(selected.sleeperId);
    }
    starters.push(formatPlayer(selected));
  }

  const bench = players.filter(p => !usedIds.has(p.sleeperId)).map(formatPlayer);
  bench.sort((a, b) => a[0] - b[0]);
  return [starters, bench];
}

function formatPlayer(p) {
  if (!p || p.sleeperId === 'N/D') {
    return ['N/D', 'N/D', 'N/D', 'N/D', 'N/D', 'N/D', 'N/D'];
  }
  return [
    p.rank,
    p.nombre,
    p.position,
    p.team,
    p.matchup,
    p.byeWeek,
    p.injuryStatus
  ];
}

function firstAvailable(pool, usedIds) {
  return pool.find(p => !usedIds.has(p.sleeperId));
}

function createEmptySlot(position) {
  return {
    rank: 'N/D',
    nombre: 'N/D',
    position,
    team: 'N/D',
    matchup: 'N/D',
    byeWeek: 'N/D',
    injuryStatus: 'N/D',
    sleeperId: 'N/D'
  };
}
