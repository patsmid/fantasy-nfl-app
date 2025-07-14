import { getNflState } from '../utils/sleeper.js';
import { positions } from '../utils/constants.js';

export async function getFlockRankings({ dynasty, superflex, expert = null }) {
  let format = 'REDRAFT';
  if (dynasty) format = superflex ? 'SUPERFLEX' : 'ONEQB';

  const url = `https://ljcdtaj4i2.execute-api.us-east-2.amazonaws.com/rankings?format=${format}&pickType=hybrid`;
  console.log('📊 URL Flock Rankings:', url);

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Error HTTP ${res.status}`);
    const json = await res.json();
    const data = json.data || [];

    if (!expert) return data;

    return data
      .filter(p => expert in p.ranks)
      .map(p => ({
        ...p,
        rank: p.ranks[expert],
        tier: p.tiers?.[expert] || null,
        positional_tier: p.positional_tiers?.[expert] || null
      }))
      .sort((a, b) => a.rank - b.rank);
  } catch (err) {
    console.error('❌ Error en getFlockRankings:', err.message);
    return [];
  }
}

export async function getFantasyProsRankings({ season, dynasty, scoring, idExpert, position, weekStatic = null }) {
  const nflState = await getNflState();
  let week = 0;

  if (nflState.season_type === 'pre') week = 0;
  else week = nflState.week;

  if (weekStatic !== null && weekStatic !== '') {
    week = parseInt(weekStatic);
  }

  let pos = position;
  if (position === 'TODAS' && (nflState.season_type === 'pre' || week === 0)) {
    pos = 'TODAS_PRE';
  }

  const posObj = positions.find(p => p.nombre === pos) || positions.find(p => p.nombre === 'TODAS');
  const posValue = posObj.valor;

  let type = 'PRESEASON';
  if (week > 0) type = 'WEEKLY';
  if (dynasty) type = 'DK';

  const url = `https://partners.fantasypros.com/api/v1/expert-rankings.php?sport=NFL&year=${season}&week=${week}&id=${idExpert}&position=${posValue}&type=${type}&notes=false&scoring=${scoring}&export=json&host=ta`;
  console.log('📊 URL FantasyPros Rankings:', url);

  const res = await fetch(url);
  return await res.json();
}
