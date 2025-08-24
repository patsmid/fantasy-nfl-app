import { getNflState } from '../utils/sleeper.js';
import { positions } from '../utils/constants.js';
import { getExpertData } from '../experts.js';
import { supabase } from '../supabaseClient.js';

export async function getRankings({ season, dynasty, scoring, expertData, position, weekStatic = null }) {
  const nflState = await getNflState();

  if (expertData.source === 'manual') {
    return await getManualRankings(expertData.id);
  }

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
  const week = nflState.season_type === 'pre' ? 0 : nflState.week;
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
  console.log('📊 URL FantasyPros Rankings:', url);
  //https://partners.fantasypros.com/api/v1/expert-rankings.php?sport=NFL&year=2025&week=0&id=3701&position=ALL&type=PRESEASON&notes=false&scoring=PPR&export=json&host=ta
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
  console.log('📊 URL Flock Rankings:', url);

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

export async function getManualRankings(expertId) {
  console.log('🔹 getManualRankings iniciado para expertId:', expertId);

  if (!expertId) throw new Error('Debe indicar expertId para rankings manuales');

  try {
    // 1️⃣ Obtener manual_rankings del experto
    const { data: manualData, error: manualError } = await supabase
      .from('manual_rankings')
      .select('sleeper_player_id, rank, tier, updated_at, expert:experts(experto, source)')
      .eq('expert_id', expertId)
      .order('rank', { ascending: true });

    if (manualError) {
      console.error('❌ Error al obtener manual_rankings:', manualError);
      throw manualError;
    }

    console.log('✅ manualData obtenida, total registros:', manualData.length);
    if (!manualData || manualData.length === 0) {
      console.warn('⚠️ No se encontraron manual_rankings para este experto');
      return { source: 'manual', published: null, expert: null, players: [] };
    }

    // 2️⃣ Obtener solo los jugadores correspondientes de la tabla players
    const playerIds = manualData.map(r => r.sleeper_player_id);

    const { data: playersData, error: playersError } = await supabase
      .from('players')
      .select('player_id, full_name, position, team')
      .in('player_id', playerIds);

    if (playersError) {
      console.error('❌ Error al obtener players:', playersError);
      throw playersError;
    }

    // 3️⃣ Combinar manualData y playersData por player_id
    const combinedPlayers = manualData.map((r, index) => {
      const player = playersData.find(p => p.player_id === r.sleeper_player_id);
      if (!player) console.warn('⚠️ No se encontró jugador para sleeper_player_id:', r.sleeper_player_id);

      const combined = {
        id: r.sleeper_player_id,
        player_id: r.sleeper_player_id,
        full_name: player?.full_name || null,
        position: player?.position || null,
        team: player?.team || null,
        rank: r.rank,
        tier: r.tier
      };

      return combined;
    });

    return {
      source: 'manual',
      published: manualData[0].updated_at || new Date().toISOString(),
      expert: manualData[0].expert || null,
      players: combinedPlayers
    };
  } catch (err) {
    console.error('❌ Error en getManualRankings:', err.message);
    return { source: 'manual', published: null, expert: null, players: [] };
  }
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
