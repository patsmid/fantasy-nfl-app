import { supabase, getSupabaseForUser } from '../supabaseClient.js';

const { DEBUG_AUTH } = process.env;

/**
 * Middleware de autenticación
 * - Valida el Bearer token
 * - Inyecta req.user y req.db (cliente supabase con impersonación)
 */
export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) return res.status(401).json({ error: 'Missing bearer token' });

    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: 'Invalid token' });

    req.user = data.user;
    req.db = getSupabaseForUser(token);

    if (DEBUG_AUTH === '1') {
      try {
        const dbg = await req.db.rpc('debug_ctx');
        console.log('🔎 RLS ctx:', dbg.data);
      } catch (e) {
        console.log('ℹ️ debug_ctx no disponible:', e.message);
      }
    }

    next();
  } catch (err) {
    console.error('Auth error:', err);
    return res.status(401).json({ error: 'Unauthorized' });
  }
}
