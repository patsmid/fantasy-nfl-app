import { supabase } from './supabaseClient.js';

export async function updateLeagues(req, res) {
  try {
    // 1. Leer main_user_id y season desde config
    const { data: config, error: configError } = await supabase
      .from('config')
      .select('key, value')
      .in('key', ['main_user_id', 'season']);

    if (configError) throw configError;

    const configMap = Object.fromEntries(config.map(c => [c.key, c.value]));
    const userId = configMap.main_user_id;
    const season = configMap.season;

    if (!userId || !season) {
      return res.status(400).json({ success: false, error: 'Faltan main_user_id o season en config' });
    }

    // 2. Obtener ligas desde API Sleeper
    const response = await fetch(`https://api.sleeper.app/v1/user/${userId}/leagues/nfl/${season}`);
    if (!response.ok) throw new Error('Error al obtener ligas de Sleeper');

    const leagues = await response.json();

    // 3. Formatear ligas para insertar
    const formatted = leagues.map(l => ({
      league_id: l.league_id,
      name: l.name,
      draft_id: l.draft_id || null,
      total_rosters: l.total_rosters || null,
      status: l.status || null,
      dynasty: l.type === 2,                         // dynasty según type
      bestball: l.settings?.best_ball === 1,        // bestball booleano
      display_order: l.display_order || 0,          // display_order desde API
      updated_at: new Date().toISOString()
    }));

    // 4. Borrar ligas previas
    const { error: delError } = await supabase.from('leagues').delete().neq('league_id', '');
    if (delError) throw delError;

    // 5. Insertar nuevas ligas
    const { error: insertError } = await supabase.from('leagues').insert(formatted);
    if (insertError) throw insertError;

    res.json({ success: true, message: `${formatted.length} ligas actualizadas.` });
  } catch (err) {
    console.error('❌ Error en updateLeagues:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// controllers/leagues.js

export async function getLeaguesFromDB(req, res) {
  try {
    const { data, error } = await supabase
      .from('leagues')
      .select('*')
      .order('display_order', { ascending: true });

    if (error) throw error;

    res.json({ success: true, data });
  } catch (err) {
    console.error('❌ Error en getLeaguesFromDB:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getLeagues(req, res) {
  try {
    // Leer main_user_id y Año desde config
    const { data: config, error: configError } = await supabase
      .from('config')
      .select('key, value')
      .in('key', ['main_user_id', 'season'])
      .order('display_order', { ascending: true });

    if (configError) throw configError;

    const configMap = Object.fromEntries(config.map(c => [c.key, c.value]));
    const userId = configMap.main_user_id;
    const season = configMap['season'];

    if (!userId || !season) {
      return res.status(400).json({ success: false, error: 'Faltan main_user_id o Año en config' });
    }

    // Consumir la API de Sleeper
    const response = await fetch(`https://api.sleeper.app/v1/user/${userId}/leagues/nfl/${season}`);
    if (!response.ok) throw new Error('Error al obtener ligas de Sleeper');

    const leagues = await response.json();

    res.json({ success: true, data: leagues });
  } catch (err) {
    console.error('❌ Error en getLeagues:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getLeagueById(req, res) {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('leagues')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    console.error('❌ Error en getLeagueById:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function updateLeagueDynasty(req, res) {
  try {
    const { id } = req.params;
    const { dynasty } = req.body;

    const { error } = await supabase
      .from('leagues')
      .update({ dynasty, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Error en updateLeagueDynasty:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}
