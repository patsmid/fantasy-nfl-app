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

  const { data, error } = await supabase
    .from('projections_raw')
    .select('player_id, stats, week, season')
    .eq('season', season)
    .lte('week', fullSeasonLength)
    .order('week')
    .range(0, 9999);

  if (error) throw new Error('Error DB: ' + error.message);

  const projectionsMap = new Map();

  for (const row of data) {
    const points = calculateProjection(row.stats, scoringSettings);

		if (Number.isNaN(points)) {
			console.warn('❌ Proyección inválida para', row.player_id, row.stats);
		}

    if (!projectionsMap.has(row.player_id)) {
      projectionsMap.set(row.player_id, {
        player_id: row.player_id,
        total_ppr: 0,
      });
    }

    projectionsMap.get(row.player_id).total_ppr += points;
  }

  return Array.from(projectionsMap.values());
}

export async function getTotalProjections_alt(leagueId) {
  const { season } = await getNflState();
  const leagueData = await getSleeperLeague(leagueId);
  const scoringSettings = leagueData.scoring_settings;

  const { data, error } = await supabase
    .from('projections_total')
    .select('player_id, stats, season')
    .eq('season', season)
    .range(0, 9999);

  if (error) throw new Error('Error DB: ' + error.message);

  const projections = data.map(row => {
    const total_ppr = calculateProjection(row.stats, scoringSettings);
    return {
      player_id: row.player_id,
      total_ppr
    };
  });

  return projections;
}


export function calculateProjection(stats = {}, scoring = {}) {
  return Object.entries(scoring).reduce((acc, [key, multiplier]) => {
    const raw = stats[key];
    const value = typeof raw === 'string' ? parseFloat(raw) : raw;
    if (typeof value !== 'number' || isNaN(value)) return acc;
    return acc + value * multiplier;
  }, 0);
}

export async function getTotalProjectionsFromSleeper(leagueId) {
  const { season } = await getNflState();
  const leagueData = await getSleeperLeague(leagueId);
  const scoringSettings = leagueData.scoring_settings;

  const regularSeasonLength = leagueData.settings.playoff_week_start - 1;
  const playoffs = await getPlayoffsData(leagueId);
  const playoffLength = playoffs.at(-1)?.r || 0;
  const fullSeasonLength = regularSeasonLength + playoffLength;

  const weeks = Array.from({ length: fullSeasonLength }, (_, i) => i + 1);
  const allProjections = new Map();

  const OFFENSIVE_POSITIONS = ['QB', 'RB', 'WR', 'TE'];

  const fetches = weeks.map(week => {
    const url = `https://api.sleeper.app/projections/nfl/${season}/${week}?season_type=regular&position[]=FLEX&position[]=K&position[]=QB&position[]=RB&position[]=REC_FLEX&position[]=SUPER_FLEX&position[]=TE&position[]=WR&position[]=WRRB_FLEX&order_by=ppr`;
    return fetch(url)
      .then(res => res.ok ? res.json() : [])
      .catch(() => []);
  });

  const allWeeks = await Promise.all(fetches);

  for (const weekProjections of allWeeks) {
    for (const entry of weekProjections) {
      const stats = entry.stats || {};
      if (stats.adp_dd_ppr === 1000 && stats.pos_adp_dd_ppr === undefined) continue;

      const player_id = entry.player_id;
      const position = entry.player?.position || entry.player?.fantasy_positions?.[0] || '';
      if (!OFFENSIVE_POSITIONS.includes(position)) continue;

      const points = calculateProjection(stats, scoringSettings);

      if (!allProjections.has(player_id)) {
        allProjections.set(player_id, {
          player_id,
          total_ppr: 0,
          position
        });
      }

      allProjections.get(player_id).total_ppr += points;
    }
  }

  return Array.from(allProjections.values());
}

// export function calculateProjection(stats = {}, scoring = {}) {
//   return Object.entries(stats).reduce(
//     (acc, [stat, val]) => acc + (val * (scoring[stat] || 0)), 0
//   );
// }

export async function fetchAndStoreProjections(fromWeek = 1, toWeek = 18) {
  const { season } = await getNflState();
  const seasonType = 'regular';
  const OFFENSIVE_POSITIONS = ['QB', 'RB', 'WR', 'TE'];
  const weeks = Array.from({ length: toWeek - fromWeek + 1 }, (_, i) => fromWeek + i);
  const updated_at = new Date().toISOString();

  const weekly = [];
  const totalMap = new Map();

  // Paso 1: Borrar SOLO semanas actuales para no perder datos previos
  await Promise.all([
    supabase
      .from('projections_raw')
      .delete()
      .eq('season', season)
      .gte('week', fromWeek)
      .lte('week', toWeek)
  ]);

  // Paso 2: Fetch concurrente
  const fetches = weeks.map(week => {
    const url = `https://api.sleeper.app/projections/nfl/${season}/${week}?season_type=${seasonType}&position[]=FLEX&position[]=K&position[]=QB&position[]=RB&position[]=REC_FLEX&position[]=SUPER_FLEX&position[]=TE&position[]=WR&position[]=WRRB_FLEX&order_by=ppr`;
    return fetch(url).then(res => (res.ok ? res.json() : []));
  });

  const allWeeksData = await Promise.all(fetches);

  for (let i = 0; i < weeks.length; i++) {
    const week = weeks[i];
    const data = allWeeksData[i];

    for (const entry of data) {
      const stats = entry.stats || {};
      const player_id = entry.player_id;
      const position = entry.player?.position || entry.player?.fantasy_positions?.[0];

      if (!OFFENSIVE_POSITIONS.includes(position)) continue;
      if (stats.adp_dd_ppr === 1000 && stats.pos_adp_dd_ppr === undefined) continue;

      weekly.push({
        player_id,
        season,
        week,
        stats,
        updated_at
      });

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
    supabase.from('projections_raw').insert(weekly),
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
