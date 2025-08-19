import express from 'express';
import { requireAuth } from './auth/authMiddleware.js';

const router = express.Router();

// Aplica auth a todo el router
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
