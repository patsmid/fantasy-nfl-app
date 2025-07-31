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

  // Filtrar por rol
  const menuItems = data.filter(item => item.roles?.includes(role));

  // Construir árbol
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

export default router;
