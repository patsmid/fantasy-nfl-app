import { supabase } from './supabaseClient.js';

/* ---------------------------
   Util: obtener user desde token
   --------------------------- */
async function getUserFromAuthHeader(req) {
  try {
    const authHeader = req.headers?.authorization || req.headers?.Authorization;
    if (!authHeader) return null;
    const token = String(authHeader).replace(/^Bearer\s+/i, '').trim();
    if (!token) return null;

    // supabase.auth.getUser(token) devuelve { data: { user }, error }
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      console.warn('getUserFromAuthHeader: supabase.auth.getUser error', error);
      return null;
    }
    return data.user;
  } catch (err) {
    console.warn('getUserFromAuthHeader error', err);
    return null;
  }
}

/* ---------------------------
   Utilities
   --------------------------- */
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

/* =====================================================
   Admin / Sleeper related (dejamos tal como tenías pero
   en un módulo separado idealmente)
   ===================================================== */

export async function updateLeagues(req, res) {
  try {
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

    const response = await fetch(`https://api.sleeper.app/v1/user/${userId}/leagues/nfl/${season}`);
    if (!response.ok) throw new Error('Error al obtener ligas de Sleeper');

    const leagues = await response.json();

    const formatted = leagues.map(l => ({
      league_id: l.league_id,
      name: l.name,
      draft_id: l.draft_id || null,
      total_rosters: l.total_rosters || null,
      status: l.status || null,
      dynasty: l.settings?.type === 2,
      bestball: l.settings?.best_ball === 1,
      display_order: l.display_order || 0,
      updated_at: new Date().toISOString()
    }));

    // Reemplazamos solo las ligas que traemos (si quieres hacer merge, podemos cambiar)
    const { error: delError } = await supabase.from('leagues').delete().neq('league_id', '');
    if (delError) throw delError;

    const { error: insertError } = await supabase.from('leagues').insert(formatted);
    if (insertError) throw insertError;

    res.json({ success: true, message: `${formatted.length} ligas actualizadas.` });
  } catch (err) {
    console.error('Error en updateLeagues:', err);
    res.status(500).json({ success: false, error: err.message || err });
  }
}

/* =====================================================
   Lectura general (no manual) - mantenemos para compatibilidad
   ===================================================== */
export async function getLeaguesFromDB(req, res) {
  try {
    const { data, error } = await supabase
      .from('leagues')
      .select('*')
      .order('display_order', { ascending: true });

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    console.error('Error en getLeaguesFromDB:', err);
    res.status(500).json({ success: false, error: err.message || err });
  }
}

/* =====================================================
   MANUAL: CRUD y endpoints orientados al usuario autenticado
   ===================================================== */

/**
 * upsertLeagueManual
 * Crea o actualiza una liga manual. Si no llega league_id el servidor genera uno.
 * Si user_id viene vacío, queda null.
 */
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
      return res.status(400).json({ success: false, error: 'El campo name es obligatorio' });
    }

    const finalLeagueId = league_id && String(league_id).trim() !== '' ? league_id : generateLeagueId();
    const userIdNormalized = user_id && String(user_id).trim() !== '' ? user_id : null;

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
    console.error('Error en upsertLeagueManual:', err);
    res.status(500).json({ success: false, error: err.message || err });
  }
}

/**
 * GET /manual/leagues
 * Si viene Authorization header (Bearer token), devolvemos las ligas del usuario autenticado.
 * Parámetros opcionales:
 *  - include_null=1 -> incluye ligas sin user_id además de las del usuario
 *
 * Retorna { success: true, data: [...] }
 */
export async function getManualLeaguesForAuthUser(req, res) {
  try {
    const user = await getUserFromAuthHeader(req);
    if (!user) return res.status(401).json({ success: false, error: 'No autorizado' });

    const includeNull = String(req.query.include_null || '') === '1';

    let query = supabase
      .from('leagues')
      .select('*')
      .order('display_order', { ascending: true });

    if (includeNull) {
      // or syntax: user_id.eq.<id>,user_id.is.null
      const filter = `user_id.eq.${user.id},user_id.is.null`;
      const { data, error } = await query.or(filter);
      if (error) throw error;
      return res.json({ success: true, data });
    }

    const { data, error } = await query.eq('user_id', user.id);
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    console.error('Error en getManualLeaguesForAuthUser:', err);
    res.status(500).json({ success: false, error: err.message || err });
  }
}

/**
 * GET /manual/leagues/user/:user_id
 * Endpoint legacy/admin: devuelve ligas por user_id pasado en URL.
 * Query: include_null=1 -> incluye también user_id IS NULL
 */
export async function getLeaguesByUser(req, res) {
  try {
    const { user_id } = req.params;
    const includeNull = String(req.query.include_null || '') === '1';

    const base = supabase.from('leagues').select('*').order('display_order', { ascending: true });

    if (includeNull) {
      const { data, error } = await base.or(`user_id.eq.${user_id},user_id.is.null`);
      if (error) throw error;
      return res.json({ success: true, data });
    }

    const { data, error } = await base.eq('user_id', user_id);
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    console.error('Error en getLeaguesByUser:', err);
    res.status(500).json({ success: false, error: err.message || err });
  }
}

/**
 * deleteLeagueById
 */
export async function deleteLeagueById(req, res) {
  try {
    const { id } = req.params;

    // Nota: aquí podrías validar que el user haga la petición (owner) o que tenga rol admin.
    const { error } = await supabase.from('leagues').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('Error en deleteLeagueById:', err);
    res.status(500).json({ success: false, error: err.message || err });
  }
}

/**
 * setLeagueUser
 */
export async function setLeagueUser(req, res) {
  try {
    const { id } = req.params;
    const { user_id = null } = req.body;
    const userIdNormalized = user_id && String(user_id).trim() !== '' ? user_id : null;

    const { data, error } = await supabase
      .from('leagues')
      .update({ user_id: userIdNormalized, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    console.error('Error en setLeagueUser:', err);
    res.status(500).json({ success: false, error: err.message || err });
  }
}

/* =====================================================
   league_settings CRUD (JSONB)
   ===================================================== */

/**
 * upsertLeagueSettings
 * Body: { league_id, scoring_type, num_teams, superflex, dynasty, bestball, playoff_weeks, playoff_weight_factor, starter_positions }
 */
export async function upsertLeagueSettings(req, res) {
  try {
    const payload = {
      league_id: req.body.league_id,
      scoring_type: req.body.scoring_type ?? null,
      num_teams: req.body.num_teams ?? null,
      superflex: req.body.superflex ?? null,
      dynasty: req.body.dynasty ?? null,
      bestball: req.body.bestball ?? null,
      playoff_weeks: req.body.playoff_weeks ?? null,
      playoff_weight_factor: req.body.playoff_weight_factor ?? null,
      starter_positions: req.body.starter_positions ?? null,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('league_settings')
      .upsert(payload)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    console.error('Error en upsertLeagueSettings:', err);
    res.status(500).json({ success: false, error: err.message || err });
  }
}

/**
 * getLeagueSettings
 * GET /manual/league-settings/:league_id
 */
export async function getLeagueSettings(req, res) {
  try {
    const { league_id } = req.params;
    const { data, error } = await supabase.from('league_settings').select('*').eq('league_id', league_id).single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    console.error('Error en getLeagueSettings:', err);
    res.status(500).json({ success: false, error: err.message || err });
  }
}

/**
 * deleteLeagueSettings
 */
export async function deleteLeagueSettings(req, res) {
  try {
    const { league_id } = req.params;
    const { error } = await supabase.from('league_settings').delete().eq('league_id', league_id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('Error en deleteLeagueSettings:', err);
    res.status(500).json({ success: false, error: err.message || err });
  }
}

/* =====================================================
   league_drafted_players CRUD
   ===================================================== */

export async function addDraftedPlayer(req, res) {
  try {
    const { league_id, player_id, drafted_by = null, pick_number = null, round = null } = req.body;
    const { data, error } = await supabase
      .from('league_drafted_players')
      .insert([{ league_id, player_id, drafted_by, pick_number, round }])
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    console.error('Error en addDraftedPlayer:', err);
    res.status(500).json({ success: false, error: err.message || err });
  }
}

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
    console.error('Error en getDraftedPlayers:', err);
    res.status(500).json({ success: false, error: err.message || err });
  }
}

export async function resetDraftedPlayers(req, res) {
  try {
    const { league_id } = req.params;
    const { error } = await supabase.from('league_drafted_players').delete().eq('league_id', league_id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('Error en resetDraftedPlayers:', err);
    res.status(500).json({ success: false, error: err.message || err });
  }
}
