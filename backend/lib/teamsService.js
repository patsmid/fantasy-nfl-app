import { supabase } from '../supabaseClient.js';
import fetch from 'node-fetch';

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

export async function upsertTeams(teams) {
  const { data, error } = await supabase
    .from('teams')
    .upsert(teams, {
      onConflict: ['abbr'],
    });

  if (error) {
    console.error('❌ Error al guardar en Supabase:', error.message);
    return { success: false, error };
  }

  return { success: true, data };
}
