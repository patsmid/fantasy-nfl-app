// extras.routes.js
import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

const { SUPABASE_URL, SUPABASE_ANON_KEY, DEBUG_AUTH } = process.env;

/**
 * Cliente SOLO para validar tokens (ANON KEY, sin JWT de usuario).
 * No usar este cliente para queries con RLS, solo para auth.getUser(token).
 */
const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Middleware de autenticación
 * - Valida el Bearer token
 * - Crea un cliente de BD por-request (req.db) con Authorization: Bearer <user_token>
 *   para que RLS (auth.uid(), auth.jwt()) funcione.
 */
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing bearer token' });

    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: 'Invalid token' });

    req.user = data.user;

    // Cliente de BD por-request “impersonando” al usuario:
    req.db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    // Debug opcional del contexto que verá RLS en Postgres
    if (DEBUG_AUTH === '1') {
      try {
        const dbg = await req.db.rpc('debug_ctx'); // crea la función con el SQL más abajo (opcional)
        console.log('🔎 RLS ctx:', dbg.data);
      } catch (e) {
        console.log('ℹ️ debug_ctx no disponible:', e.message);
      }
    }

    return next();
  } catch (err) {
    console.error('Auth error:', err);
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

// ¿Es admin? (ajústalo a tu modelo; aquí por email)
const ADMIN_EMAILS = new Set(['admin@fantasy.com']);
function isAdmin(user) {
  return !!user?.email && ADMIN_EMAILS.has(user.email.toLowerCase());
}

// Aplica auth a todo
router.use(requireAuth);

// ------------------ LINKS ------------------
router.get('/links', async (req, res) => {
  try {
    console.log('👉 req.user', { id: req.user.id, email: req.user.email });

    let q = req.db.from('links').select('*').order('updated_at', { ascending: false });

    // Si no eres admin, filtra por dueño (además de la RLS)
    if (!isAdmin(req.user)) {
      console.log('Filtrando por user_id:', req.user.id);
      q = q.eq('user_id', req.user.id);
    } else {
      console.log('Usuario admin, sin filtro user_id (RLS debe permitirlo)');
    }

    const { data, error } = await q;
    if (error) {
      console.error('❌ Supabase error:', error);
      return res.status(500).json({ error: error.message || error });
    }
    console.log('✅ Query result:', data);
    return res.json({ success: true, data });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Unexpected error' });
  }
});

router.post('/links', async (req, res) => {
  const { title, url, description } = req.body;
  const { data, error } = await req.db
    .from('links')
    .insert({ title, url, description, user_id: req.user.id })
    .select();
  if (error) return res.status(500).json({ error: error.message || error });
  res.json({ success: true, data });
});

router.put('/links/:id', async (req, res) => {
  const { id } = req.params;
  const { title, url, description } = req.body;
  const upd = { title, url, description, updated_at: new Date(), user_id: req.user.id };

  let q = req.db.from('links').update(upd).eq('id', id);
  if (!isAdmin(req.user)) q = q.eq('user_id', req.user.id);

  const { data, error } = await q.select();
  if (error) return res.status(500).json({ error: error.message || error });
  res.json({ success: true, data });
});

router.delete('/links/:id', async (req, res) => {
  const { id } = req.params;
  let q = req.db.from('links').delete().eq('id', id);
  if (!isAdmin(req.user)) q = q.eq('user_id', req.user.id);

  const { error } = await q;
  if (error) return res.status(500).json({ error: error.message || error });
  res.json({ success: true });
});

// ------------------ NOTES ------------------
router.get('/notes', async (req, res) => {
  const q = req.db.from('notes').select('*').order('updated_at', { ascending: false });
  const { data, error } = await (isAdmin(req.user) ? q : q.eq('user_id', req.user.id));
  if (error) return res.status(500).json({ error: error.message || error });
  res.json({ success: true, data });
});

router.post('/notes', async (req, res) => {
  const { title, content } = req.body;
  const { data, error } = await req.db
    .from('notes')
    .insert({ title, content, user_id: req.user.id, updated_at: new Date() })
    .select();
  if (error) return res.status(500).json({ error: error.message || error });
  res.json({ success: true, data });
});

router.put('/notes/:id', async (req, res) => {
  const { id } = req.params;
  const { title, content } = req.body;
  const upd = { title, content, user_id: req.user.id, updated_at: new Date() };

  let q = req.db.from('notes').update(upd).eq('id', id);
  if (!isAdmin(req.user)) q = q.eq('user_id', req.user.id);

  const { data, error } = await q.select();
  if (error) return res.status(500).json({ error: error.message || error });
  res.json({ success: true, data });
});

router.delete('/notes/:id', async (req, res) => {
  const { id } = req.params;
  let q = req.db.from('notes').delete().eq('id', id);
  if (!isAdmin(req.user)) q = q.eq('user_id', req.user.id);

  const { error } = await q;
  if (error) return res.status(500).json({ error: error.message || error });
  res.json({ success: true });
});

// ------------------ TASKS ------------------
router.get('/tasks', async (req, res) => {
  const q = req.db.from('tasks').select('*').order('updated_at', { ascending: false });
  const { data, error } = await (isAdmin(req.user) ? q : q.eq('user_id', req.user.id));
  if (error) return res.status(500).json({ error: error.message || error });
  res.json({ success: true, data });
});

router.post('/tasks', async (req, res) => {
  const { task } = req.body;
  const { data, error } = await req.db
    .from('tasks')
    .insert({ task, completed: false, user_id: req.user.id, updated_at: new Date() })
    .select();
  if (error) return res.status(500).json({ error: error.message || error });
  res.json({ success: true, data });
});

router.put('/tasks/:id', async (req, res) => {
  const { id } = req.params;
  const { task, completed } = req.body;
  const upd = { task, completed, user_id: req.user.id, updated_at: new Date() };

  let q = req.db.from('tasks').update(upd).eq('id', id);
  if (!isAdmin(req.user)) q = q.eq('user_id', req.user.id);

  const { data, error } = await q.select();
  if (error) return res.status(500).json({ error: error.message || error });
  res.json({ success: true, data });
});

router.delete('/tasks/:id', async (req, res) => {
  const { id } = req.params;
  let q = req.db.from('tasks').delete().eq('id', id);
  if (!isAdmin(req.user)) q = q.eq('user_id', req.user.id);

  const { error } = await q;
  if (error) return res.status(500).json({ error: error.message || error });
  res.json({ success: true });
});

export default router;
