import { getNflState } from '../utils/sleeper.js';
import { positions } from '../utils/constants.js';
import { getExpertData } from '../experts.js';
import { supabase } from '../supabaseClient.js';

export async function getRankings({ source, season, dynasty, scoring, expertData, position, weekStatic = null, expertId = null }) {
  const nflState = await getNflState();

  switch (source) {
    case 'flock': {
      const superflex = position === 'SUPER FLEX';
      const { data, last_updated } = await getFlockRankings({
        dynasty,
        superflex,
        expert: expertData.experto
      });

      return {
        source: 'flock',
        published: last_updated,
        players: data
      };
    }

    case 'fantasypros': {
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

      const res = await fetch(url);
      const json = await res.json();

      return {
        source: 'fantasypros',
        published: json.published,
        players: json.players || []
      };
    }

    case 'manual': {
      if (!expertId && expertData?.id_experto) expertId = expertData.id_experto;
      if (!expertId) throw new Error('Debe indicar expertId para rankings manuales');
      return await getManualRankings({ expertId });
    }

    default:
      throw new Error(`Ranking source "${source}" no soportado`);
  }
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

export async function getManualRankings({ expertId }) {
  if (!expertId) throw new Error('Debe indicar expertId');

  const { data, error } = await supabase
    .from('manual_rankings')
    .select(`
      id,
      rank,
      tier,
      updated_at,
      players:players(full_name, position, team, player_id),
      expert:experts(experto, source)
    `)
    .eq('expert_id', expertId)
    .order('rank', { ascending: true });

  if (error) {
    console.error('❌ Error en getManualRankings:', error.message);
    return {
      source: 'manual',
      published: null,
      players: []
    };
  }

  return {
    source: 'manual',
    published: data.length ? data[0].updated_at : new Date().toISOString(),
    expert: data.length ? data[0].expert : null,
    players: data.map(r => ({
      id: r.id,
      player_id: r.players.player_id,
      full_name: r.players.full_name,
      position: r.players.position,
      team: r.players.team,
      rank: r.rank,
      tier: r.tier
    }))
  };
}

export async function getFantasyProsRankings({ season, dynasty, scoring, idExpert, position, weekStatic = null }) {
  return await getRankings({ season, dynasty, scoring, idExpert, position, weekStatic });
}

export async function getDSTRankings({ season, dynasty, expertData, weekStatic }) {
  return await getRankings({
    season,
    dynasty,
    scoring: 'STD',
    expertData,
    position: 'DST',
    weekStatic
  });
}

export async function getKickerRankings({ season, dynasty, expertData, weekStatic }) {
  return await getRankings({
    season,
    dynasty,
    scoring: 'STD',
    expertData,
    position: 'K',
    weekStatic
  });
}
