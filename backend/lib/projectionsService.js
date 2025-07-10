import fetch from 'node-fetch';
import { supabase } from '../supabaseClient.js';
import { getNflState, getSleeperLeague, getPlayoffsData } from '../utils/sleeper.js';

export async function getPlayerRawStats(playerId, leagueId) {
  const { season } = await getNflState();

  const { data, error } = await supabase
    .from('projections_raw')
    .select('week, stats')
    .eq('season', season)
    .eq('player_id', playerId)
    .order('week');

  if (error) throw new Error(`Error al obtener stats del jugador ${playerId}: ${error.message}`);
  if (!data || data.length === 0) return [];

  // Obtener configuración de la liga y semanas a considerar
  let totalProjected = 0;
  let fullSeasonLength = 18; // fallback
  let scoringSettings = {};

  if (leagueId) {
    try {
      const leagueData = await getSleeperLeague(leagueId);
      const playoffs = await getPlayoffsData(leagueId);
      const regularSeasonLength = leagueData.settings.playoff_week_start - 1;
      const playoffLength = playoffs.at(-1)?.r || 0;
      fullSeasonLength = regularSeasonLength + playoffLength;
      scoringSettings = leagueData?.scoring_settings || {};
    } catch (err) {
      console.warn(`⚠️ No se pudo obtener datos de la liga ${leagueId}:`, err.message);
    }
  }

  // Filtrar semanas válidas
  const validWeeks = data.filter(d => typeof d.week === 'number' && d.week <= fullSeasonLength);

  // Calcular stats totales
  const totalStats = {};
  for (const entry of validWeeks) {
    for (const [key, value] of Object.entries(entry.stats)) {
      if (typeof value === 'number') {
        totalStats[key] = (totalStats[key] || 0) + value;
      }
    }
  }

  // Redondear stats
  for (const key in totalStats) {
    totalStats[key] = Math.round((totalStats[key] + Number.EPSILON) * 100) / 100;
  }

  // Calcular total proyectado personalizado
  for (const [statKey, statValue] of Object.entries(totalStats)) {
    const multiplier = scoringSettings[statKey];
    if (typeof multiplier === 'number') {
      totalProjected += statValue * multiplier;
    }
  }

  totalProjected = Math.round((totalProjected + Number.EPSILON) * 100) / 100;

  // Agregar fila total
  data.push({
    week: 'total',
    stats: totalStats,
    total_projected: totalProjected,
    final_week: fullSeasonLength
  });

  return data;
}

export async function getAllPlayersProjectedTotals(leagueId) {
  const { season } = await getNflState();

  // 1. Configuración de la liga
  let fullSeasonLength = 18;
  let scoringSettings = {};

  if (leagueId) {
    try {
      const leagueData = await getSleeperLeague(leagueId);
      const playoffs = await getPlayoffsData(leagueId);
      const regularSeasonLength = leagueData.settings.playoff_week_start - 1;
      const playoffLength = playoffs.at(-1)?.r || 0;
      fullSeasonLength = regularSeasonLength + playoffLength;
      scoringSettings = leagueData.scoring_settings || {};
    } catch (err) {
      console.warn(`⚠️ No se pudo obtener datos de la liga ${leagueId}:`, err.message);
    }
  }

  // 2. Obtener todos los datos paginando
  let allData = [];
  const pageSize = 1000;
  let from = 0;
  let to = pageSize - 1;

  while (true) {
    const { data, error, count } = await supabase
      .from('projections_raw')
      .select('player_id, week, stats', { count: 'exact' })
      .eq('season', String(season))
      .lte('week', fullSeasonLength)
      .range(from, to);
       console.log(`📄 Página ${from}–${to}:`, data.length, 'registros');

    if (error) throw new Error(`Error en fetch paginado: ${error.message}`);
    if (!data || data.length === 0) break;

    allData = allData.concat(data);

    if (data.length < pageSize) break;

    from += pageSize;
    to += pageSize;
  }

  // 3. Agrupar y acumular stats por jugador
  const statsByPlayer = new Map();

  for (const row of allData) {
    const { player_id, stats } = row;

    if (!player_id || !stats) continue;

    if (!statsByPlayer.has(player_id)) {
      statsByPlayer.set(player_id, {});
    }

    const playerStats = statsByPlayer.get(player_id);

    for (const [key, value] of Object.entries(stats)) {
      if (typeof value === 'number') {
        playerStats[key] = (playerStats[key] || 0) + value;
      }
    }
  }

  // 4. Calcular total_projected
  const result = [];

  for (const [player_id, statTotals] of statsByPlayer.entries()) {
    let total = 0;

    for (const [statKey, statValue] of Object.entries(statTotals)) {
      const multiplier = scoringSettings[statKey];
      if (typeof multiplier === 'number') {
        total += statValue * multiplier;
      }
    }

    result.push({
      player_id,
      total_projected: Math.round((total + Number.EPSILON) * 100) / 100,
    });
  }

  // 5. Ordenar descendente por total_projected
  result.sort((a, b) => b.total_projected - a.total_projected);

  return result;
}


export async function getTotalProjectionsFromDb(leagueId) {
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
	  .order('week', { ascending: true })
	  .limit(10000);

  if (error) throw new Error('Error DB: ' + error.message);

	const weeksStored = [...new Set(data.map(d => d.week))];
	console.log(`📦 Semanas disponibles en BD para ${season}:`, weeksStored);

  const projectionsMap = new Map();

  for (const row of data) {
    const { player_id, week } = row;
    const stats = typeof row.stats === 'string' ? JSON.parse(row.stats) : row.stats;

    if (player_id === '4984') {
      console.log(`\n📅 Week ${week} - player_id 4984:\n`, stats);
    }

    const points = calculateProjection(stats, scoringSettings);

    if (Number.isNaN(points)) {
      console.warn('❌ Proyección inválida para', player_id, stats);
    }

    if (!projectionsMap.has(player_id)) {
      projectionsMap.set(player_id, {
        player_id: player_id,
        total_ppr: 0,
      });
    }

    projectionsMap.get(player_id).total_ppr += points;
  }

  return Array.from(projectionsMap.values());
}



export async function getTotalProjections(leagueId) {
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
    if (row.player_id === '4984') {
      console.log('[📥] Datos desde DB player_id=4984:', row.stats);
    }

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

    const product = value * multiplier;

    if (stats?.player_id === '4984' || key === 'pass_td') {
      console.log(`[📊] ${key}: ${value} * ${multiplier} = ${product}`);
    }

    return acc + product;
  }, 0);
}

export async function testSingleProjectionFromApi() {
  const season = '2025';
  const url = `https://api.sleeper.app/projections/nfl/${season}/1?season_type=regular&position[]=QB`;

  const res = await fetch(url);
  const data = await res.json();

  const player = data.find(p => p.player_id === '4984');
  if (!player) return console.log('❌ No encontrado player_id=4984');

  console.log('[🌐] Sleeper API Week 1 - 4984:', player.stats);
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

  // ❌ Borramos proyecciones semanales del rango actual
  await supabase
    .from('projections_raw')
    .delete()
    .eq('season', season)
    .gte('week', fromWeek)
    .lte('week', toWeek);

  // ✅ Obtenemos stats totales previos desde projections_total
  const { data: existingTotals, error: totalError } = await supabase
    .from('projections_total')
    .select('player_id, stats')
    .eq('season', season);

  if (totalError) throw new Error('Error al obtener stats acumulados: ' + totalError.message);

  for (const row of existingTotals) {
    totalMap.set(row.player_id, {
      player_id: row.player_id,
      season,
      stats: { ...row.stats },
      updated_at
    });
  }

  // 📦 Descarga de nuevas proyecciones semanales
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

      // 📥 Guardar proyección semanal
			weekly.push({
			  player_id: String(player_id),
			  season: String(season),
			  week: Number(week),
			  stats: { ...stats },
			  updated_at
			});

      // ✅ Sumar a stats totales (previos + nuevos)
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
        const rawVal = stats[key];
        const val = typeof rawVal === 'string' ? parseFloat(rawVal) : rawVal;

        if (typeof val !== 'number' || isNaN(val)) continue;

        totalStats[key] = (totalStats[key] || 0) + val;

        if (player_id === '4984') {
          console.log(`[🔁] Week ${week} - ${key}: +${val} → ${totalStats[key]}`);
        }
      }
    }
  }

  if (totalMap.has('4984')) {
    console.log('[✅] Total acumulado player_id=4984:', totalMap.get('4984').stats);
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
