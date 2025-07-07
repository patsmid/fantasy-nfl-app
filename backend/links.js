import express from 'express';
import { supabase } from './supabaseClient.js';

const router = express.Router();

// Obtener todos los links
router.get('/', async (req, res) => {
  const { data, error } = await supabase.from('links').select('*').order('updated_at', { ascending: false });
  if (error) return res.status(500).json({ error });
  res.json({ data });
});

// Crear un nuevo link
router.post('/', async (req, res) => {
  const { title, url, description } = req.body;
  const { data, error } = await supabase.from('links').insert({ title, url, description }).select();
  if (error) return res.status(500).json({ error });
  res.json({ success: true, data });
});

// Actualizar un link
router.put('/:id', async (req, res) => {
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
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from('links').delete().eq('id', id);
  if (error) return res.status(500).json({ error });
  res.json({ success: true });
});

export default router;
