import express from 'express';
import { supabase } from './supabaseClient.js';

const router = express.Router();

// Obtener todos los links
router.get('/links', async (req, res) => {
  const { data, error } = await supabase.from('links').select('*').order('updated_at', { ascending: false });
  if (error) return res.status(500).json({ error });
  res.json({ success: true, data });
});

// Crear un nuevo link
router.post('/links', async (req, res) => {
  const { title, url, description } = req.body;
  const { data, error } = await supabase.from('links').insert({ title, url, description }).select();
  if (error) return res.status(500).json({ error });
  res.json({ success: true, data });
});

// Actualizar un link
router.put('/links/:id', async (req, res) => {
  const { id } = req.params;
  const { title, url, description } = req.body;
  const { data, error } = await supabase
    .from('links')
    .update({ title, url, description, updated_at: new Date() })
    .eq('id', id)
    .select();
  if (error) return res.status(500).json({ error });
  res.json({ success: true, data });
});

// Eliminar link por ID
router.delete('/links/:id', async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from('links').delete().eq('id', id);
  if (error) return res.status(500).json({ error });
  res.json({ success: true });
});

// ----- NOTES -----
router.get('/notes', async (req, res) => {
  const { data, error } = await supabase.from('notes').select('*').order('updated_at', { ascending: false });
  if (error) return res.status(500).json({ error });
  res.json({ data });
});

router.post('/notes', async (req, res) => {
  const { title, content } = req.body;
  const { data, error } = await supabase.from('notes').insert({ title, content, updated_at: new Date() }).select();
  if (error) return res.status(500).json({ error });
  res.json({ success: true, data });
});

router.put('/notes/:id', async (req, res) => {
  const { id } = req.params;
  const { title, content } = req.body;
  const { data, error } = await supabase.from('notes').update({ title, content, updated_at: new Date() }).eq('id', id).select();
  if (error) return res.status(500).json({ error });
  res.json({ success: true, data });
});

router.delete('/notes/:id', async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from('notes').delete().eq('id', id);
  if (error) return res.status(500).json({ error });
  res.json({ success: true });
});

// ----- TASKS -----
router.get('/tasks', async (req, res) => {
  const { data, error } = await supabase.from('tasks').select('*').order('updated_at', { ascending: false });
  if (error) return res.status(500).json({ error });
  res.json({ data });
});

router.post('/tasks', async (req, res) => {
  const { task } = req.body;
  const { data, error } = await supabase.from('tasks').insert({ task, completed: false, updated_at: new Date() }).select();
  if (error) return res.status(500).json({ error });
  res.json({ success: true, data });
});

router.put('/tasks/:id', async (req, res) => {
  const { id } = req.params;
  const { task, completed } = req.body;
  const { data, error } = await supabase.from('tasks').update({ task, completed, updated_at: new Date() }).eq('id', id).select();
  if (error) return res.status(500).json({ error });
  res.json({ success: true, data });
});

router.delete('/tasks/:id', async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) return res.status(500).json({ error });
  res.json({ success: true });
});

export default router;
