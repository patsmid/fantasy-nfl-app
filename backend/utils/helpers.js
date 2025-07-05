export function getMexicoCityISOString() {
  const date = new Date();

  const options = {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  };

  const parts = new Intl.DateTimeFormat('en-CA', options).formatToParts(date);
  const getPart = type => parts.find(p => p.type === type)?.value.padStart(2, '0');

  const yyyy = getPart('year');
  const MM = getPart('month');
  const dd = getPart('day');
  const hh = getPart('hour');
  const mm = getPart('minute');
  const ss = getPart('second');

  return `${yyyy}-${MM}-${dd}T${hh}:${mm}:${ss}-06:00`; // Hora estándar México
}

export function formatDateToMexico(dateString) {
  const options = {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  };

  return new Intl.DateTimeFormat('es-MX', options).format(new Date(dateString));
}

export function findPlayerRank(name, rankings) {
  const nameLower = name.toLowerCase();
  const match = rankings.find(p =>
    (p.name + ' ' + (p.team || '')).toLowerCase().includes(nameLower)
  );
  return match ? {
    rank: match.rank || 9999,
    pos_rank: match.pos_rank || '',
    bye_week: match.bye_week || 0
  } : {
    rank: 9999,
    pos_rank: '',
    bye_week: 0
  };
}

// utils.js

export function fuzzySearch(name, list) {
  if (!name || !list || !Array.isArray(list)) return [];

  const norm = (s) => typeof s === 'string'
    ? s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    : '';

  const nameNorm = norm(name);

  return list.filter(player => {
    const playerName = player?.name;
    return playerName && norm(playerName).includes(nameNorm);
  });
}


export function getStarterPositions(leagueData) {
  const rosterPositions = leagueData.roster_positions;
  const firstBench = rosterPositions.indexOf('BN');
  return rosterPositions.slice(0, firstBench);
}

export function getADPtype(scoring, dynasty, superFlex) {
  return (dynasty ? 'DYNASTY_' : '') + (superFlex ? 'SF' : scoring);
}
