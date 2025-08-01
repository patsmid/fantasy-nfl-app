export function generateLineup(players, starterPositions) {
  const starters = [];
  const bench = [];

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

  const used = new Set();

  for (const starterPosition of starterPositions) {
    let candidate;
    const isUsed = (p) => !used.has(p.sleeperId);

    switch (starterPosition) {
      case 'QB':
        candidate = qbs.find(isUsed);
        break;
      case 'RB':
        candidate = rbs.find(isUsed);
        break;
      case 'WR':
        candidate = wrs.find(isUsed);
        break;
      case 'TE':
        candidate = tes.find(isUsed);
        break;
      case 'DEF':
        candidate = defs.find(isUsed);
        break;
      case 'K':
        candidate = ks.find(isUsed);
        break;
      case 'WRRB_FLEX':
        candidate = wrrb.find(isUsed);
        break;
      case 'FLEX':
        candidate = flex.find(isUsed);
        break;
      case 'REC_FLEX':
        candidate = recflex.find(isUsed);
        break;
      case 'SUPER_FLEX':
        candidate = sflex.find(isUsed);
        break;
      default:
        break;
    }

    if (candidate) {
      starters.push(candidate);
      used.add(candidate.sleeperId);
    } else {
      starters.push({
        rank: '—',
        nombre: 'Vacío',
        position: starterPosition,
        team: '',
        matchup: '',
        byeWeek: '',
        injuryStatus: '',
        sleeperId: starterPosition + '_N/D'
      });
    }
  }

  const benchList = players.filter(p => !used.has(p.sleeperId));

  benchList.sort((a, b) => a.rank - b.rank);

  return [starters, benchList];
}
