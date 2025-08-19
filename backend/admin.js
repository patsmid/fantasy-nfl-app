import express from 'express';
import { supabase } from './supabaseClient.js';

const router = express.Router();

// --- helpers ---
function isValidUsername(username = '') {
  // ajusta el patrón a tu gusto (solo letras, números, punto, guion y guion bajo)
  return /^[a-zA-Z0-9._-]{3,32}$/.test(username);
}

async function resolveRole({ username, roleFallback = 'user' }) {
  if (!username) return { role: roleFallback, from: 'fallback' };

  if (!isValidUsername(username)) {
    return { error: 'USERNAME_INVALID', status: 400 };
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('username', username)
    .single();

  if (error || !data) {
    return { error: 'USER_NOT_FOUND', status: 404 };
  }

  return { role: data.role, from: 'profiles' };
}

// ------------------ MENÚ (dinámico por rol/username) ------------------
router.get('/menu', async (req, res) => {
  try {
    const username = req.query.username?.trim();
    const roleQuery = req.query.role?.trim(); // compatibilidad hacia atrás
    const roleDefault = roleQuery || 'user';

    const resolved = await resolveRole({ username, roleFallback: roleDefault });
    if (resolved.error) {
      if (resolved.status === 400) return res.status(400).json({ error: 'Username inválido' });
      if (resolved.status === 404) return res.status(404).json({ error: 'Usuario no encontrado' });
      return res.status(500).json({ error: 'No se pudo resolver el rol' });
    }

    const role = resolved.role;

    const { data, error } = await supabase
      .from('sidebar_menu')
      .select('*')
      .eq('enabled', true)
      .order('display_order', { ascending: true });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // Filtrar por rol (mantengo tu lógica actual en Node)
    const menuItems = (data || []).filter(item => Array.isArray(item.roles) && item.roles.includes(role));

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

    return res.json(tree);
  } catch (err) {
    console.error('Error /menu:', err);
    return res.status(500).json({ error: 'Error interno' });
  }
});

// ------------------ CONFIG (sin cambios funcionales) ------------------
router.get('/menu/config', async (req, res) => {
  const { data, error } = await supabase
    .from('sidebar_menu')
    .select('*')
    .order('parent_id', { ascending: true })
    .order('display_order', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ------------------ CRUD (sin cambios) ------------------
router.post('/menu', async (req, res) => {
  const { title, icon, view, parent_id, roles, enabled } = req.body;
  const rolesArray = Array.isArray(roles) ? roles : [roles || 'user'];

  const { data, error } = await supabase.from('sidebar_menu').insert([
    {
      title,
      icon,
      view,
      parent_id: parent_id ? parseInt(parent_id) : null,
      roles: rolesArray,
      enabled,
      updated_at: new Date().toISOString()
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

  const results = await Promise.all(
    updates.map(({ id, order, parent_id }) =>
      supabase
        .from('sidebar_menu')
        .update({ display_order: order, parent_id })
        .eq('id', id)
    )
  );

  if (results.some(r => r.error)) {
    return res.status(500).json({ error: 'Error al reordenar elementos del menú.' });
  }

  res.status(200).json({ ok: true });
});

router.post('/menu/upsert', async (req, res) => {
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
    const upsertItem = {
      title,
      icon,
      view,
      parent_id: parent_id ? parseInt(parent_id) : null,
      roles,
      display_order,
      enabled,
      updated_at: new Date().toISOString()
    };

    if (id) {
      upsertItem.id = parseInt(id);
    }

    const { data, error } = await supabase
      .from('sidebar_menu')
      .upsert([upsertItem], { onConflict: ['id'] });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Error al hacer upsert del menú:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/menu/order', async (req, res) => {
  const updates = req.body; // [{ id, display_order }, ...]

  try {
    await Promise.all(
      updates.map(({ id, display_order }) =>
        supabase
          .from('sidebar_menu')
          .update({ display_order, updated_at: new Date().toISOString() })
          .eq('id', id)
      )
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error al actualizar orden:', err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------ Endpoints auxiliares ------------------
// Verificar/obtener rol por username (útil para /:username antes de pedir menú)
router.get('/user/resolve', async (req, res) => {
  const username = req.query.username?.trim();
  if (!username) return res.status(400).json({ error: 'Username requerido' });
  if (!isValidUsername(username)) return res.status(400).json({ error: 'Username inválido' });

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, role')
    .eq('username', username)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Usuario no encontrado' });
  return res.json(data);
});

// 404 JSON para rutas no encontradas en este router
router.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

export default router;
