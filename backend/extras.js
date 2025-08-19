// extras.routes.js
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { supabase as dbClient } from './supabaseClient.js'; // tu cliente actual para BD (probablemente service_role)

const router = express.Router();

// Cliente SOLO para validar tokens (usar ANON KEY, NO service_role)
const supabaseAuth = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// --- Middleware de autenticación ---
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing bearer token' });

    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: 'Invalid token' });

    req.user = data.user; // { id, email, ... }
    return next();
  } catch (err) {
    console.error('Auth error:', err);
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

// (Opcional) helper: ¿es admin?
function isAdmin(user) {
  // Si manejas roles en auth.user_metadata o en profiles:
  const role = user?.user_metadata?.role || user?.role; // ajusta a tu modelo
  return role === 'admin';
}

// Usa el cliente de BD
const supabase = dbClient;

// APLICA AUTH A TODO LO DE EXTRAS
router.use(requireAuth);

// ------------------ LINKS ------------------
// GET: solo del usuario (o todos si admin y así lo decides)
router.get('/links', async (req, res) => {
  console.log('👉 req.user', req.user);

  let q = supabase.from('links').select('*').order('updated_at', { ascending: false });
  if (!isAdmin(req.user)) {
    console.log('Filtrando por user_id:', req.user.id);
    q = q.eq('user_id', req.user.id);
  } else {
    console.log('Usuario admin, sin filtro user_id');
  }

  const { data, error } = await q;
  if (error) {
    console.error('❌ Supabase error:', error);
    return res.status(500).json({ error: error.message || error });
  }
  console.log('✅ Query result:', data);
  res.json({ success: true, data });
});

router.post('/links', async (req, res) => {
  const { title, url, description } = req.body;
  const { data, error } = await supabase
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

  let q = supabase.from('links').update(upd).eq('id', id);
  if (!isAdmin(req.user)) q = q.eq('user_id', req.user.id);

  const { data, error } = await q.select();
  if (error) return res.status(500).json({ error: error.message || error });
  res.json({ success: true, data });
});

router.delete('/links/:id', async (req, res) => {
  const { id } = req.params;
  let q = supabase.from('links').delete().eq('id', id);
  if (!isAdmin(req.user)) q = q.eq('user_id', req.user.id);

  const { error } = await q;
  if (error) return res.status(500).json({ error: error.message || error });
  res.json({ success: true });
});

// ------------------ NOTES ------------------
router.get('/notes', async (req, res) => {
  const q = supabase.from('notes').select('*').order('updated_at', { ascending: false });
  const { data, error } = await (isAdmin(req.user) ? q : q.eq('user_id', req.user.id));
  if (error) return res.status(500).json({ error: error.message || error });
  res.json({ success: true, data });
});

router.post('/notes', async (req, res) => {
  const { title, content } = req.body;
  const { data, error } = await supabase
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

  let q = supabase.from('notes').update(upd).eq('id', id);
  if (!isAdmin(req.user)) q = q.eq('user_id', req.user.id);

  const { data, error } = await q.select();
  if (error) return res.status(500).json({ error: error.message || error });
  res.json({ success: true, data });
});

router.delete('/notes/:id', async (req, res) => {
  const { id } = req.params;
  let q = supabase.from('notes').delete().eq('id', id);
  if (!isAdmin(req.user)) q = q.eq('user_id', req.user.id);

  const { error } = await q;
  if (error) return res.status(500).json({ error: error.message || error });
  res.json({ success: true });
});

// ------------------ TASKS ------------------
router.get('/tasks', async (req, res) => {
  const q = supabase.from('tasks').select('*').order('updated_at', { ascending: false });
  const { data, error } = await (isAdmin(req.user) ? q : q.eq('user_id', req.user.id));
  if (error) return res.status(500).json({ error: error.message || error });
  res.json({ success: true, data });
});

router.post('/tasks', async (req, res) => {
  const { task } = req.body;
  const { data, error } = await supabase
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

  let q = supabase.from('tasks').update(upd).eq('id', id);
  if (!isAdmin(req.user)) q = q.eq('user_id', req.user.id);

  const { data, error } = await q.select();
  if (error) return res.status(500).json({ error: error.message || error });
  res.json({ success: true, data });
});

router.delete('/tasks/:id', async (req, res) => {
  const { id } = req.params;
  let q = supabase.from('tasks').delete().eq('id', id);
  if (!isAdmin(req.user)) q = q.eq('user_id', req.user.id);

  const { error } = await q;
  if (error) return res.status(500).json({ error: error.message || error });
  res.json({ success: true });
});

export default router;
