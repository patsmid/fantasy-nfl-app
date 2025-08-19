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
        const dbg = await req.db.rpc('debug_ctx');
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

// Aplica auth a todo
router.use(requireAuth);

// ------------------ LINKS ------------------
router.get('/links', async (req, res) => {
  const { data, error } = await req.db.from('links').select('*').order('updated_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message || error });
  res.json({ success: true, data });
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

  const { data, error } = await req.db.from('links').update(upd).eq('id', id).select();
  if (error) return res.status(500).json({ error: error.message || error });
  res.json({ success: true, data });
});

router.delete('/links/:id', async (req, res) => {
  const { id } = req.params;
  const { error } = await req.db.from('links').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message || error });
  res.json({ success: true });
});

// ------------------ NOTES ------------------
router.get('/notes', async (req, res) => {
  const { data, error } = await req.db.from('notes').select('*').order('updated_at', { ascending: false });
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

  const { data, error } = await req.db.from('notes').update(upd).eq('id', id).select();
  if (error) return res.status(500).json({ error: error.message || error });
  res.json({ success: true, data });
});

router.delete('/notes/:id', async (req, res) => {
  const { id } = req.params;
  const { error } = await req.db.from('notes').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message || error });
  res.json({ success: true });
});

// ------------------ TASKS ------------------
router.get('/tasks', async (req, res) => {
  const { data, error } = await req.db.from('tasks').select('*').order('updated_at', { ascending: false });
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

  const { data, error } = await req.db.from('tasks').update(upd).eq('id', id).select();
  if (error) return res.status(500).json({ error: error.message || error });
  res.json({ success: true, data });
});

router.delete('/tasks/:id', async (req, res) => {
  const { id } = req.params;
  const { error } = await req.db.from('tasks').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message || error });
  res.json({ success: true });
});

export default router;
