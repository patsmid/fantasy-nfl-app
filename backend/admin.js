import express from 'express';
import { supabase } from './supabaseClient.js';

const router = express.Router();

router.get('/menu', async (req, res) => {
  const role = req.query.role || 'user';

  const { data, error } = await supabase
    .from('sidebar_menu')
    .select('*')
    .eq('enabled', true)
    .order('display_order', { ascending: true });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const menuItems = data.filter(item => item.roles?.includes(role));

  const map = new Map();
  const tree = [];

  for (const item of menuItems) {
    map.set(item.id, { ...item, children: [] });
  }

  for (const item of menuItems) {
    if (item.parent_id) {
      const parent = map.get(item.parent_id);
      if (parent) parent.children.push(map.get(item.id));
    } else {
      tree.push(map.get(item.id));
    }
  }

  res.json(tree);
});

router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('sidebar_menu')
    .select('*')
    .order('parent_id', { ascending: true })
    .order('display_order', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/menu', async (req, res) => {
  const { title, icon, view, parent_id, roles, enabled } = req.body;
  const rolesArray = Array.isArray(roles) ? roles : [roles || 'user'];

  const { data, error } = await supabase.from('sidebar_menu').insert([
    {
      title,
      icon,
      view,
      parent_id,
      roles: rolesArray,
      enabled
    }
  ]);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.put('/menu/:id', async (req, res) => {
  const id = req.params.id;
  const { title, icon, view, parent_id, roles, enabled } = req.body;

  const { data, error } = await supabase
    .from('sidebar_menu')
    .update({ title, icon, view, parent_id, roles, enabled })
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.delete('/menu/:id', async (req, res) => {
  const { error } = await supabase
    .from('sidebar_menu')
    .delete()
    .eq('id', req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.status(204).end();
});

router.post('/menu/reorder', async (req, res) => {
  const updates = req.body; // [{ id, order, parent_id }]

  const updatesPromises = updates.map(({ id, order, parent_id }) =>
    supabase
      .from('sidebar_menu')
      .update({ display_order: order, parent_id })
      .eq('id', id)
  );

  const results = await Promise.all(updatesPromises);

  if (results.some(r => r.error)) {
    return res.status(500).json({ error: 'Error al reordenar elementos del menú.' });
  }

  res.status(200).json({ ok: true });
});

router.post('/upsert', async (req, res) => {
  const {
    id,
    title,
    icon,
    view,
    parent_id,
    roles,
    display_order,
    enabled
  } = req.body;

  try {
    const { data, error } = await supabase
      .from('sidebar_menu')
      .upsert(
        [
          {
            id: id ? parseInt(id) : undefined,
            title,
            icon,
            view,
            parent_id: parent_id ? parseInt(parent_id) : null,
            roles,
            display_order,
            enabled,
            updated_at: new Date().toISOString()
          }
        ],
        { onConflict: ['id'] }
      );

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Error al hacer upsert del menú:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/order', async (req, res) => {
  const updates = req.body; // [{ id, display_order }, ...]

  try {
    const updatePromises = updates.map(({ id, display_order }) =>
      supabase
        .from('sidebar_menu')
        .update({ display_order, updated_at: new Date().toISOString() })
        .eq('id', id)
    );

    await Promise.all(updatePromises);
    res.json({ success: true });
  } catch (err) {
    console.error('Error al actualizar orden:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
