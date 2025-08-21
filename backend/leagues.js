import { supabase, supabaseAdmin  } from './supabaseClient.js';

/* ---------------------------
   Util: obtener user desde token (server-side)
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
   ADMIN / SLEEPER (legacy)
   ===================================================== */

/**
 * updateLeagues
 * Refresca ligas desde la API de Sleeper usando main_user_id + season en config.
 */
export async function updateLeagues(req, res) {
  try {
    const { data: config, error: configError } = await supabase
      .from('config')
      .select('key, value')
      .in('key', ['main_user_id', 'season']);

    if (configError) throw configError;

    const configMap = Object.fromEntries((config || []).map(c => [c.key, c.value]));
    const userId = configMap.main_user_id;
    const season = configMap.season;

    if (!userId || !season) {
      return res.status(400).json({ success: false, error: 'Faltan main_user_id o season en config' });
    }

    const response = await fetch(`https://api.sleeper.app/v1/user/${userId}/leagues/nfl/${season}`);
    if (!response.ok) throw new Error('Error al obtener ligas de Sleeper');

    const leagues = await response.json();

    const formatted = (leagues || []).map(l => ({
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

    // Reemplazamos (haz backup si necesitas merge)
    const { error: delError } = await supabase.from('leagues').delete().neq('league_id', '');
    if (delError) throw delError;

    const { error: insertError } = await supabase.from('leagues').insert(formatted);
    if (insertError) throw insertError;

    res.json({ success: true, message: `${formatted.length} ligas actualizadas.` });
  } catch (err) {
    console.error('❌ Error en updateLeagues:', err);
    res.status(500).json({ success: false, error: err.message || err });
  }
}

/**
 * getLeagues
 * Devuelve ligas Raw desde sleeper con main_user_id + season (legacy)
 */
export async function getLeagues(req, res) {
  try {
    const { data: config, error: configError } = await supabase
      .from('config')
      .select('key, value')
      .in('key', ['main_user_id', 'season']);

    if (configError) throw configError;

    const configMap = Object.fromEntries((config || []).map(c => [c.key, c.value]));
    const userId = configMap.main_user_id;
    const season = configMap.season;

    if (!userId || !season) {
      return res.status(400).json({ success: false, error: 'Faltan main_user_id o Año en config' });
    }

    const response = await fetch(`https://api.sleeper.app/v1/user/${userId}/leagues/nfl/${season}`);
    if (!response.ok) throw new Error('Error al obtener ligas de Sleeper');

    const leagues = await response.json();
    res.json({ success: true, data: leagues });
  } catch (err) {
    console.error('❌ Error en getLeagues:', err);
    res.status(500).json({ success: false, error: err.message || err });
  }
}

/* =====================================================
   DB: lectura simple
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
    console.error('❌ Error en getLeaguesFromDB:', err);
    res.status(500).json({ success: false, error: err.message || err });
  }
}

/* =====================================================
   Legacy single league
   ===================================================== */
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
    console.error('❌ Error en getLeagueById:', err);
    res.status(500).json({ success: false, error: err.message || err });
  }
}

/* =====================================================
   Legacy update dynasty flag
   ===================================================== */
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
    console.error('❌ Error en updateLeagueDynasty:', err);
    res.status(500).json({ success: false, error: err.message || err });
  }
}

/* =====================================================
   MANUAL: CRUD y endpoints para usuario autenticado
   ===================================================== */

/**
 * upsertLeagueManual
 */
 // Reemplaza la función upsertLeagueManual por esta versión:

 export async function upsertLeagueManual(req, res) {
   try {
     // 🔹 1. Extraer token del header
     const authHeader = req.headers['authorization'];
     if (!authHeader?.startsWith('Bearer ')) {
       return res.status(401).json({ success: false, error: 'No se proporcionó token válido' });
     }
     const token = authHeader.split(' ')[1];

     // 🔹 2. Validar token y obtener el user_id desde Supabase
     const {
       data: { user },
       error: userError
     } = await supabaseAdmin.auth.getUser(token);

     if (userError || !user) {
       console.error('❌ Error validando token:', userError?.message);
       return res.status(401).json({ success: false, error: 'Token inválido o expirado' });
     }

     const userId = user.id;

     // -----------------------
     // Helpers
     // -----------------------
     const body = req.body || {};
     const addIfDefined = (obj, key, value) => {
       if (value === undefined) return;
       // no añadir strings vacíos que signifiquen "no cambiar"
       if (typeof value === 'string' && value.trim() === '') return;
       obj[key] = value;
     };

     const toBool = v => {
       if (v === undefined || v === null) return undefined;
       if (typeof v === 'boolean') return v;
       if (typeof v === 'number') return Boolean(v);
       const s = String(v).toLowerCase();
       if (s === 'true' || s === '1') return true;
       if (s === 'false' || s === '0') return false;
       return undefined;
     };

     const parsePlayoffWeeks = (raw) => {
       if (raw === undefined || raw === null) return undefined;
       if (Array.isArray(raw)) return raw.map(n => Number(n)).filter(x => Number.isFinite(x));
       if (typeof raw === 'string') {
         const arr = raw.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n));
         return arr.length ? arr : undefined;
       }
       return undefined;
     };

     const parseStarterPositions = (raw) => {
       if (raw === undefined || raw === null) return undefined;
       if (typeof raw === 'string') {
         try { return JSON.parse(raw); } catch { return undefined; }
       }
       return raw;
     };

     // -----------------------
     // Construir payload conservador (solo campos presentes)
     // -----------------------
     const {
       league_id = null,
       name,
       draft_id = undefined,
       total_rosters = undefined,
       status = undefined,
       dynasty = undefined,
       bestball = undefined,
       display_order = undefined,
       scoring_type = undefined,
       num_teams = undefined,
       superflex = undefined,
       playoff_weeks = undefined,
       playoff_weight_factor = undefined,
       starter_positions = undefined,
       manual = undefined
     } = body;

     if (!name || String(name).trim() === '') {
       return res.status(400).json({ success: false, error: 'El campo name es obligatorio' });
     }

     const finalLeagueId =
       league_id && String(league_id).trim() !== '' ? league_id : generateLeagueId();

     const payload = {};
     // obligatorios/siempre: league_id (clave para upsert), name, user_id, updated_at
     payload.league_id = finalLeagueId;
     payload.name = name;
     payload.user_id = userId;
     payload.updated_at = new Date().toISOString();

     // Campos opcionales: añadimos solo si el cliente los envía
     addIfDefined(payload, 'draft_id', draft_id ?? null); // permitimos null explícito
     addIfDefined(payload, 'total_rosters', total_rosters !== undefined ? Number(total_rosters) : undefined);
     addIfDefined(payload, 'status', status);
     addIfDefined(payload, 'display_order', display_order !== undefined ? Number(display_order) : undefined);

     // dynasty / bestball (booleanos)
     const dDyn = toBool(dynasty);
     if (dDyn !== undefined) payload.dynasty = dDyn;
     const dBest = toBool(bestball);
     if (dBest !== undefined) payload.bestball = dBest;

     // manual flag
     const dManual = toBool(manual);
     if (dManual !== undefined) {
       payload.manual = dManual;
     } else {
       // si el request viene de tu UI manual, frontend ya envía manual:true.
       // Si quieres forzarlo desde backend (p.e. siempre marcar manual en upsert desde este endpoint),
       // descomenta la siguiente línea:
       // payload.manual = true;
     }

     // Settings-like fields (ahora almacenados en leagues)
     addIfDefined(payload, 'scoring_type', scoring_type);
     addIfDefined(payload, 'num_teams', num_teams !== undefined ? Number(num_teams) : undefined);
     const sFlex = toBool(superflex);
     if (sFlex !== undefined) payload.superflex = sFlex;
     const pw = parsePlayoffWeeks(playoff_weeks);
     if (pw !== undefined) payload.playoff_weeks = pw;
     addIfDefined(payload, 'playoff_weight_factor', playoff_weight_factor !== undefined ? Number(playoff_weight_factor) : undefined);
     const sp = parseStarterPositions(starter_positions);
     if (sp !== undefined) payload.starter_positions = sp;

     // Logging para debug: muestra las claves que vamos a upsert
     console.info('[upsertLeagueManual] upsert payload keys:', Object.keys(payload));

     // -----------------------
     // Upsert seguro (onConflict por league_id)
     // -----------------------
     const { data, error } = await supabaseAdmin
       .from('leagues')
       .upsert(payload, { onConflict: 'league_id' })
       .select()
       .single();

     if (error) {
       console.error('[upsertLeagueManual] supabase upsert error:', error);
       throw error;
     }

     res.json({ success: true, data });
   } catch (err) {
     console.error('❌ Error en upsertLeagueManual:', err);
     res.status(500).json({ success: false, error: err.message || 'Error interno en el servidor' });
   }
 }

/**
 * getManualLeaguesForAuthUser
 * GET /manual/leagues  (el frontend pedirá esta ruta sin user_id; el servidor decide)
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
      const filter = `user_id.eq.${user.id},user_id.is.null`;
      const { data, error } = await query.or(filter);
      if (error) throw error;
      return res.json({ success: true, data });
    }

    const { data, error } = await query.eq('user_id', user.id);
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    console.error('❌ Error en getManualLeaguesForAuthUser:', err);
    res.status(500).json({ success: false, error: err.message || err });
  }
}

/**
 * getLeaguesByUser (legacy/admin)
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
    console.error('❌ Error en getLeaguesByUser:', err);
    res.status(500).json({ success: false, error: err.message || err });
  }
}

/**
 * deleteLeagueById
 */
 // ---------------------- PATCH: deleteLeagueById ----------------------
 export async function deleteLeagueById(req, res) {
   try {
     const { league_id } = req.params;

     if (!league_id || String(league_id).trim() === '') {
       return res.status(400).json({ success: false, error: 'Parámetro league_id vacío o faltante' });
     }

     const raw = String(league_id).trim();

     // Determinar si es id numérico (internal id) o uuid/string (league_id)
     let filterColumn;
     let filterValue;
     if (/^\d+$/.test(raw)) {
       filterColumn = 'id';
       filterValue = Number(raw);
     } else {
       filterColumn = 'league_id';
       filterValue = raw;
     }

     console.info(`[deleteLeagueById] borrando por ${filterColumn} = ${filterValue}`);

     const { data, error } = await supabase
       .from('leagues')
       .delete()
       .eq(filterColumn, filterValue)
       .select();

     if (error) throw error;

     if (!data || data.length === 0) {
       return res.status(404).json({ success: false, error: 'Liga no encontrada' });
     }

     res.json({ success: true, data });
   } catch (err) {
     console.error('❌ Error en deleteLeagueById:', err);
     res.status(500).json({ success: false, error: err.message || err });
   }
 }

 // ---------------------- PATCH: setLeagueUser ----------------------
 export async function setLeagueUser(req, res) {
   try {
     const { league_id } = req.params;
     const { user_id = null } = req.body;

     if (!league_id || String(league_id).trim() === '') {
       return res.status(400).json({ success: false, error: 'Parámetro league_id vacío o faltante' });
     }

     const raw = String(league_id).trim();
     const userIdNormalized = user_id && String(user_id).trim() !== '' ? user_id : null;

     const isNumericId = /^\d+$/.test(raw);
     const filterColumn = isNumericId ? 'id' : 'league_id';
     const filterValue = isNumericId ? Number(raw) : raw;

     console.info(`[setLeagueUser] actualizando user_id=${userIdNormalized} para ${filterColumn}=${filterValue}`);

     const { data, error } = await supabase
       .from('leagues')
       .update({ user_id: userIdNormalized, updated_at: new Date().toISOString() })
       .eq(filterColumn, filterValue)
       .select()
       .single();

     if (error) throw error;

     res.json({ success: true, data });
   } catch (err) {
     console.error('❌ Error en setLeagueUser:', err);
     res.status(500).json({ success: false, error: err.message || err });
   }
 }


/* =====================================================
   league_settings CRUD (JSONB)
   ===================================================== */
   /* ===========================
      league_settings -> ahora en leagues
      =========================== */

 function normalizeStarterPositions(raw) {
   // Acepta object/array o JSON string; devuelve jsonb-compatible (JS object/array)
   if (raw === undefined || raw === null) return undefined;
   if (typeof raw === 'string') {
     try {
       return JSON.parse(raw);
     } catch (e) {
       // si no es JSON válido, devolvemos undefined para evitar escribir garbage
       return undefined;
     }
   }
   // si es ya objeto/array, retornarlo tal cual
   return raw;
 }

 export async function upsertLeagueSettings(req, res) {
   try {
     const league_id = req.params.league_id ?? req.body.league_id;
     if (!league_id || String(league_id).trim() === '') {
       return res.status(400).json({ success: false, error: 'league_id requerido' });
     }

     // Construir payload solo con campos presentes (evitar enviar nulls que sobrescriban defaults)
     const body = req.body || {};
     const starter_positions = normalizeStarterPositions(body.starter_positions);

     const updatePayload = {};
     if (body.scoring_type !== undefined && body.scoring_type !== null) updatePayload.scoring_type = body.scoring_type;
     if (body.num_teams !== undefined && body.num_teams !== null) updatePayload.num_teams = Number(body.num_teams);
     if (body.superflex !== undefined && body.superflex !== null) updatePayload.superflex = Boolean(body.superflex);
     // dynasty/bestball ya existen en leagues; si vienen explícitos, los aplicamos
     if (body.dynasty !== undefined && body.dynasty !== null) updatePayload.dynasty = Boolean(body.dynasty);
     if (body.bestball !== undefined && body.bestball !== null) updatePayload.bestball = Boolean(body.bestball);
     if (body.playoff_weeks !== undefined && body.playoff_weeks !== null) updatePayload.playoff_weeks = Array.isArray(body.playoff_weeks) ? body.playoff_weeks : body.playoff_weeks;
     if (body.playoff_weight_factor !== undefined && body.playoff_weight_factor !== null) updatePayload.playoff_weight_factor = Number(body.playoff_weight_factor);
     if (starter_positions !== undefined) updatePayload.starter_positions = starter_positions;

     // si no hay campos para actualizar, devolvemos 400 para evitar updates vacíos
     if (Object.keys(updatePayload).length === 0) {
       return res.status(400).json({ success: false, error: 'No hay campos válidos para actualizar' });
     }

     // Siempre actualizar timestamp de settings
     updatePayload.settings_updated_at = new Date().toISOString();

     console.info(`[upsertLeagueSettings] league_id=${league_id} payload_keys=${Object.keys(updatePayload).join(',')}`);

     // Actualizar la fila en leagues según league_id (texto)
     const { data, error } = await supabase
       .from('leagues')
       .update(updatePayload)
       .eq('league_id', league_id)
       .select()
       .single();

     if (error) {
       console.error('[upsertLeagueSettings] supabase error:', error);
       throw error;
     }
     if (!data) {
       return res.status(404).json({ success: false, error: 'Liga no encontrada' });
     }

     res.json({ success: true, data });
   } catch (err) {
     console.error('❌ Error en upsertLeagueSettings:', err);
     res.status(500).json({ success: false, error: err.message || err });
   }
 }

 export async function getLeagueSettings(req, res) {
   try {
     const { league_id } = req.params;
     if (!league_id || String(league_id).trim() === '') {
       return res.status(400).json({ success: false, error: 'league_id requerido' });
     }

     // Seleccionamos solo los campos de settings (ahora en leagues)
     const cols = [
       'league_id',
       'scoring_type',
       'num_teams',
       'superflex',
       'dynasty',
       'bestball',
       'playoff_weeks',
       'playoff_weight_factor',
       'starter_positions',
       'settings_updated_at'
     ].join(',');

     const { data, error } = await supabase
       .from('leagues')
       .select(cols)
       .eq('league_id', league_id)
       .single();

     if (error) {
       console.error('[getLeagueSettings] supabase error:', error);
       throw error;
     }
     if (!data) return res.status(404).json({ success: false, error: 'Liga no encontrada' });

     // Devolver en formato compatible con lo que el frontend espera
     res.json({ success: true, data });
   } catch (err) {
     console.error('❌ Error en getLeagueSettings:', err);
     res.status(500).json({ success: false, error: err.message || err });
   }
 }

 export async function deleteLeagueSettings(req, res) {
   try {
     const { league_id } = req.params;
     if (!league_id || String(league_id).trim() === '') {
       return res.status(400).json({ success: false, error: 'league_id requerido' });
     }

     // Reset a valores por defecto (no borramos la fila de leagues)
     const resetPayload = {
       scoring_type: 'PPR',
       num_teams: 12,
       superflex: false,
       // dynasty/bestball: mantenemos los valores actuales en leagues (no forzamos)
       playoff_weeks: [15, 16, 17],
       playoff_weight_factor: 0.22,
       starter_positions: [], // jsonb empty array
       settings_updated_at: new Date().toISOString()
     };

     const { data, error } = await supabase
       .from('leagues')
       .update(resetPayload)
       .eq('league_id', league_id)
       .select()
       .single();

     if (error) {
       console.error('[deleteLeagueSettings] supabase error:', error);
       throw error;
     }
     if (!data) return res.status(404).json({ success: false, error: 'Liga no encontrada' });

     res.json({ success: true, data });
   } catch (err) {
     console.error('❌ Error en deleteLeagueSettings:', err);
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
    console.error('❌ Error en addDraftedPlayer:', err);
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
    console.error('❌ Error en getDraftedPlayers:', err);
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
    console.error('❌ Error en resetDraftedPlayers:', err);
    res.status(500).json({ success: false, error: err.message || err });
  }
}
