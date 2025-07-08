import fetch from 'node-fetch';
import { supabase } from '../supabaseClient.js';
import { getNflState, getSleeperLeague, getPlayoffsData } from '../utils/sleeper.js';

export async function getTotalProjections(leagueId) {
  const { season } = await getNflState();
  const leagueData = await getSleeperLeague(leagueId);
  const scoringSettings = leagueData.scoring_settings;

  const regularSeasonLength = leagueData.settings.playoff_week_start - 1;
  const playoffs = await getPlayoffsData(leagueId);
  const playoffLength = playoffs.at(-1)?.r || 0;
  const fullSeasonLength = regularSeasonLength + playoffLength;

  const allProjections = new Map();

  for (let week = 1; week <= fullSeasonLength; week++) {
    const url = `https://api.sleeper.app/projections/nfl/${season}/${week}?season_type=regular&position[]=DB&position[]=DEF&position[]=DL&position[]=FLEX&position[]=IDP_FLEX&position[]=K&position[]=LB&position[]=QB&position[]=RB&position[]=REC_FLEX&position[]=SUPER_FLEX&position[]=TE&position[]=WR&position[]=WRRB_FLEX&order_by=ppr`;

    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`⚠️ Falló la semana ${week}: ${res.statusText}`);
      continue;
    }

    const weekProjections = await res.json();

    for (const entry of weekProjections) {
      const id = entry.player_id;
      const projectedPoints = calculateProjection(entry.stats, scoringSettings);

      if (!allProjections.has(id)) {
        allProjections.set(id, {
          player_id: id,
          total_ppr: 0,
          position: entry.player?.position || entry.player?.fantasy_positions?.[0] || '',
        });
      }

      allProjections.get(id).total_ppr += projectedPoints;
    }
  }

  return Array.from(allProjections.values());
}

export function calculateProjection(projectedStats = {}, scoringSettings = {}) {
  let score = 0;
  for (const stat in projectedStats) {
    const multiplier = scoringSettings[stat] || 0;
    score += projectedStats[stat] * multiplier;
  }
  return score;
}

export async function fetchAndStoreProjections(fromWeek = 1, toWeek = 18) {
  const { season } = await getNflState();
  const weeks = Array.from({ length: toWeek - fromWeek + 1 }, (_, i) => fromWeek + i);
  const seasonType = 'regular';

  const weekly = [];
  const totalMap = new Map();
  const OFFENSIVE_POSITIONS = ['QB', 'RB', 'WR', 'TE'];

  console.log(`📆 Semanas a procesar:`, weeks);

  for (const week of weeks) {
    const url = `https://api.sleeper.app/projections/nfl/${season}/${week}?season_type=${seasonType}&order_by=ppr`;
    const res = await fetch(url);

    console.log(`📡 Obteniendo datos de la semana ${week}: ${url}`);

    if (!res.ok) {
      console.warn(`⚠️ Semana ${week} fallida: ${res.statusText}`);
      continue;
    }

    const data = await res.json();
    console.log(`✅ Semana ${week} descargada: ${data.length} jugadores`);

    for (const entry of data) {
      const stats = entry.stats || {};
      const player_id = entry.player_id;
      const position = entry.player?.position || entry.player?.fantasy_positions?.[0];

      if (!OFFENSIVE_POSITIONS.includes(position)) continue;

      const updated_at = new Date().toISOString();

      // Guardar semanal
      weekly.push({
        player_id,
        season,
        week,
        stats,
        updated_at
      });

      // Acumular total
      if (!totalMap.has(player_id)) {
        totalMap.set(player_id, {
          player_id,
          season,
          stats: {},
          updated_at
        });
      }

      const totalStats = totalMap.get(player_id).stats;
      for (const key in stats) {
        totalStats[key] = (totalStats[key] || 0) + stats[key];
      }
    }
  }

  const total = Array.from(totalMap.values());

  const [resWeekly, resTotal] = await Promise.all([
    supabase.from('projections_raw').upsert(weekly, { onConflict: ['player_id', 'season', 'week'] }),
    supabase.from('projections_total').upsert(total, { onConflict: ['player_id', 'season'] })
  ]);

  if (resWeekly.error) throw new Error('Error semanal: ' + resWeekly.error.message);
  if (resTotal.error) throw new Error('Error total: ' + resTotal.error.message);

  return {
    weeklyCount: weekly.length,
    totalCount: total.length
  };
}


export async function getWeeklyProjections(season, week) {
  const { data, error } = await supabase
    .from('projections_raw')
    .select('*')
    .eq('season', season)
    .eq('week', week);

  if (error) {
    console.error('❌ Error semanal:', error.message);
    return [];
  }
  return data;
}

export async function getTotalProjectionsDB(season) {
  const { data, error } = await supabase
    .from('projections_total')
    .select('*')
    .eq('season', season);

  if (error) {
    console.error('❌ Error total:', error.message);
    return [];
  }
  return data;
}
