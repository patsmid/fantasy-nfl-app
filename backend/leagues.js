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
      dynasty: l.settings?.type === 2,                         // dynasty según type
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

/* =============== CONFIGURACIONES MANUALES =============== */

/* =============== LEAGUE SETTINGS (configuración de liga) =============== */
/**
 * Inserta o actualiza una liga manualmente (upsert por league_id).
 * Incluye user_id si viene; si viene vacío, lo deja en null.
 */
 // genera league_id sin librerías externas
 function generateLeagueId() {
   if (typeof crypto !== 'undefined' && crypto.randomUUID) {
     return crypto.randomUUID();
   }
   return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
     const r = (Math.random() * 16) | 0;
     const v = c === 'x' ? r : (r & 0x3) | 0x8;
     return v.toString(16);
   });
 }

 export async function upsertLeagueManual(req, res) {
   try {
     const {
       league_id = null,
       name,
       draft_id = null,
       total_rosters = null,
       status = null,
       dynasty = null,
       bestball = null,
       display_order = 0,
       user_id = null
     } = req.body;

     if (!name) {
       return res.status(400).json({
         success: false,
         error: 'El campo name es obligatorio'
       });
     }

     // Si no viene league_id lo generamos en el servidor
     const finalLeagueId =
       league_id && String(league_id).trim() !== ''
         ? league_id
         : generateLeagueId();

     // Normaliza user_id
     const userIdNormalized =
       user_id && String(user_id).trim() !== '' ? user_id : null;

     const payload = {
       league_id: finalLeagueId,
       name,
       draft_id,
       total_rosters,
       status,
       dynasty,
       bestball,
       display_order,
       user_id: userIdNormalized,
       updated_at: new Date().toISOString()
     };

     const { data, error } = await supabase
       .from('leagues')
       .upsert(payload, { onConflict: 'league_id' })
       .select()
       .single();

     if (error) throw error;

     res.json({ success: true, data });
   } catch (err) {
     console.error('❌ Error en upsertLeagueManual:', err.message);
     res.status(500).json({ success: false, error: err.message });
   }
 }

/**
 * Obtiene todas las ligas para un usuario dado (por user_id).
 * Si necesitas incluir ligas sin user (user_id IS NULL), puedes agregar un flag query (?include_null=1).
 */
export async function getLeaguesByUser(req, res) {
  try {
    const { user_id } = req.params;                 // /leagues/user/:user_id
    const { include_null } = req.query || {};       // opcional: ?include_null=1

    let query = supabase
      .from('leagues')
      .select('*')
      .order('display_order', { ascending: true });

    if (include_null === '1') {
      // Incluye también ligas sin asignación de usuario
      const { data, error } = await query.or(`user_id.eq.${user_id},user_id.is.null`);
      if (error) throw error;
      return res.json({ success: true, data });
    }

    const { data, error } = await query.eq('user_id', user_id);
    if (error) throw error;

    res.json({ success: true, data });
  } catch (err) {
    console.error('❌ Error en getLeaguesByUser:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Elimina una liga por id (PK de tu tabla leagues).
 * Si prefieres por league_id (texto), crea otro handler similar usando .eq('league_id', league_id).
 */
export async function deleteLeagueById(req, res) {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('leagues')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Error en deleteLeagueById:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * (Opcional) Asigna o limpia el user_id de una liga existente.
 * Si envías user_id vacío o null, lo desasigna (user_id = null).
 */
export async function setLeagueUser(req, res) {
  try {
    const { id } = req.params;           // id PK de leagues
    const { user_id = null } = req.body; // uuid o null

    const userIdNormalized =
      user_id && String(user_id).trim() !== '' ? user_id : null;

    const { data, error } = await supabase
      .from('leagues')
      .update({
        user_id: userIdNormalized,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, data });
  } catch (err) {
    console.error('❌ Error en setLeagueUser:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// Crear o actualizar configuración de liga
export async function upsertLeagueSettings(req, res) {
  try {
    const { league_id, scoring_type, num_teams, superflex, dynasty, bestball, playoff_weeks, playoff_weight_factor, starter_positions } = req.body;

    const { data, error } = await supabase
      .from('league_settings')
      .upsert({
        league_id,
        scoring_type,
        num_teams,
        superflex,
        dynasty,
        bestball,
        playoff_weeks,
        playoff_weight_factor,
        starter_positions,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, data });
  } catch (err) {
    console.error('❌ Error en upsertLeagueSettings:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// Obtener configuración de una liga
export async function getLeagueSettings(req, res) {
  try {
    const { league_id } = req.params;

    const { data, error } = await supabase
      .from('league_settings')
      .select('*')
      .eq('league_id', league_id)
      .single();

    if (error) throw error;

    res.json({ success: true, data });
  } catch (err) {
    console.error('❌ Error en getLeagueSettings:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// Eliminar configuración de una liga
export async function deleteLeagueSettings(req, res) {
  try {
    const { league_id } = req.params;

    const { error } = await supabase
      .from('league_settings')
      .delete()
      .eq('league_id', league_id);

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Error en deleteLeagueSettings:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

/* =============== DRAFTED PLAYERS (jugadores drafteados) =============== */

// Insertar jugador drafteado
export async function addDraftedPlayer(req, res) {
  try {
    const { league_id, player_id, drafted_by, pick_number, round } = req.body;

    const { data, error } = await supabase
      .from('league_drafted_players')
      .insert([{ league_id, player_id, drafted_by, pick_number, round }])
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, data });
  } catch (err) {
    console.error('❌ Error en addDraftedPlayer:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// Obtener todos los jugadores drafteados por liga
export async function getDraftedPlayers(req, res) {
  try {
    const { league_id } = req.params;

    const { data, error } = await supabase
      .from('league_drafted_players')
      .select('*')
      .eq('league_id', league_id)
      .order('pick_number', { ascending: true });

    if (error) throw error;

    res.json({ success: true, data });
  } catch (err) {
    console.error('❌ Error en getDraftedPlayers:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// Eliminar todos los jugadores drafteados de una liga
export async function resetDraftedPlayers(req, res) {
  try {
    const { league_id } = req.params;

    const { error } = await supabase
      .from('league_drafted_players')
      .delete()
      .eq('league_id', league_id);

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Error en resetDraftedPlayers:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}
