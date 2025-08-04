import { getNflState } from '../utils/sleeper.js';
import { positions } from '../utils/constants.js';
import { getExpertData } from '../experts.js';

export async function getRankings({ season, dynasty, scoring, idExpert, position, weekStatic = null }) {
  const expertData = await getExpertData(idExpert);
  const nflState = await getNflState();
  if (expertData.source === 'flock') {
    const superflex = position === 'SUPER FLEX';
    const { data, last_updated } = await getFlockRankings({
      dynasty,
      superflex,
      expert: expertData.experto
    });

    return {
      source: expertData.source,
      published: last_updated,
      players: data
    };
  }

  let week = nflState.season_type === 'pre' ? 0 : nflState.week;
  if (weekStatic !== null && weekStatic !== '') {
    week = parseInt(weekStatic);
  }

  let pos = position;
  if (position === 'TODAS' && (nflState.season_type === 'pre' || week === 0)) {
    pos = 'TODAS_PRE';
  }

  const posObj = positions.find(p => p.nombre === pos) || positions.find(p => p.nombre === 'TODAS');
  const posValue = posObj.valor || pos;

  let type = 'PRESEASON';
  if (week > 0) type = 'WEEKLY';
  if (dynasty) type = 'DK';

  const url = `https://partners.fantasypros.com/api/v1/expert-rankings.php?sport=NFL&year=${season}&week=${week}&id=${expertData.id_experto}&position=${posValue}&type=${type}&notes=false&scoring=${scoring}&export=json&host=ta`;
  //console.log('📊 URL FantasyPros Rankings:', url);

  const res = await fetch(url);
  const json = await res.json();

  return {
    source: 'fantasypros',
    published: json.published,
    players: json.players || []
  };
}

export async function getFlockRankings({ dynasty, superflex, expert = null }) {
  let format = 'REDRAFT';
  if (dynasty) format = superflex ? 'SUPERFLEX' : 'ONEQB';

  const url = `https://ljcdtaj4i2.execute-api.us-east-2.amazonaws.com/rankings?format=${format}&pickType=hybrid`;
  //console.log('📊 URL Flock Rankings:', url);

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Error HTTP ${res.status}`);

    const json = await res.json();
    const rawData = json.data || [];
    const lastUpdatedAll = json.last_updated || {};

    if (!expert) {
      return {
        data: rawData,
        last_updated: Object.fromEntries(
          Object.entries(lastUpdatedAll).map(([name, iso]) => [name, iso])
        )
      };
    }

    const filteredData = rawData
      .filter(p => expert in p.ranks)
      .map(p => ({
        ...p,
        rank: p.ranks[expert],
        tier: p.tiers?.[expert] || null,
        positional_tier: p.positional_tiers?.[expert] || null
      }))
      .sort((a, b) => a.rank - b.rank);

    return {
      data: filteredData,
      last_updated: lastUpdatedAll[expert] ? lastUpdatedAll[expert] : null
    };
  } catch (err) {
    console.error('❌ Error en getFlockRankings:', err.message);
    return {
      data: [],
      last_updated: expert ? null : {}
    };
  }
}

export async function getFantasyProsRankings({ season, dynasty, scoring, idExpert, position, weekStatic = null }) {
  const expertData = await getExpertData(idExpert);
  return await getRankings({ season, dynasty, scoring, expertData.id_experto, position, weekStatic });
}

export async function getDSTRankings({ season, dynasty, idExpert, weekStatic }) {
  const expertData = await getExpertData(idExpert);
  return await getRankings({
    season,
    dynasty,
    scoring: 'STD',
    expertData.id_experto,
    position: 'DST',
    weekStatic
  });
}

export async function getKickerRankings({ season, dynasty, idExpert, weekStatic }) {
  const expertData = await getExpertData(idExpert);
  return await getRankings({
    season,
    dynasty,
    scoring: 'STD',
    expertData.id_experto,,
    position: 'K',
    weekStatic
  });
}
