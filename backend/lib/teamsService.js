import { supabase } from '../supabaseClient.js';
import fetch from 'node-fetch';

// ✅ 1. Obtener datos de bye week desde ESPN
export async function getNFLTeamsByeWeek() {
  const url = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2025?view=proTeamSchedules_wl';

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FantasyBot/1.0)',
        'Accept': 'application/json'
      }
    });

    const data = await res.json();

    const teams = data.settings?.proTeams?.map(team => ({
      team: team.name,
      abbr: team.abbrev?.toUpperCase() ?? '',
      bye: team.byeWeek
    })) ?? [];

    return teams;
  } catch (err) {
    console.error('❌ Error fetching data from ESPN:', err.message);
    return [];
  }
}

// ✅ 2. Leer equipos desde Supabase
export async function getTeamsFromSupabase() {
  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .order('team', { ascending: true });

  if (error) {
    console.error('❌ Error leyendo equipos:', error.message);
    throw new Error(error.message);
  }

  return data;
}

// ✅ 3. Guardar/actualizar equipos desde ESPN en Supabase
export async function upsertTeams(teams) {
  const { data, error } = await supabase
    .from('teams')
    .upsert(teams, { onConflict: ['abbr'] });

  if (error) {
    console.error('❌ Error al guardar en Supabase:', error.message);
    return { success: false, error };
  }

  return { success: true, data };
}

// ✅ 4. Actualizar un equipo por ID
export async function updateTeamById(id, { team, abbr, bye }) {
  if (!team || !abbr || isNaN(bye)) {
    throw new Error('Datos inválidos');
  }

  const { data, error } = await supabase
    .from('teams')
    .update({ team, abbr, bye })
    .eq('id', id)
    .select();

  if (error) {
    console.error(`❌ Error al actualizar equipo ${id}:`, error.message);
    throw new Error(error.message);
  }

  return data;
}

// ✅ 5. Actualizar bye_week uno por uno (no recomendado para muchos)
export async function updatePlayersByeWeeks() {
  const teams = await getNFLTeamsByeWeek();
  if (!teams.length) {
    console.error('❌ No se obtuvieron equipos con bye weeks');
    return { success: false, message: 'Sin datos de equipos' };
  }

  for (const team of teams) {
    const { abbr, bye } = team;

    const { error } = await supabase
      .from('players')
      .update({ bye_week: bye })
      .eq('team', abbr);

    if (error) {
      console.error(`❌ Error actualizando jugadores del equipo ${abbr}:`, error.message);
      return { success: false, error };
    }
  }

  console.log('✅ Bye weeks actualizados correctamente en tabla players');
  return { success: true };
}

// ✅ 6. Actualizar bye_week masivamente (recomendado)
export async function bulkUpdatePlayersByeWeeks() {
  const teams = await getNFLTeamsByeWeek();
  if (!teams.length) {
    console.error('❌ No se obtuvieron equipos con bye weeks');
    return { success: false, message: 'Sin datos de equipos' };
  }

  const valuesClause = teams
    .map(team => `('${team.abbr}', ${team.bye})`)
    .join(', ');

  const sql = `
    UPDATE players
    SET bye_week = t.bye
    FROM (VALUES ${valuesClause}) AS t(abbr, bye)
    WHERE players.team = t.abbr
  `;

  const { error } = await supabase.rpc('execute_sql', { query_text: sql });

  if (error) {
    console.error('❌ Error actualizando bye_week masivamente:', error.message);
    return { success: false, error };
  }

  console.log('✅ Bye weeks actualizados correctamente en tabla players');
  return { success: true };
}
