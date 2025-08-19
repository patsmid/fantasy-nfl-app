import express from 'express';
import { supabase, supabaseAdmin } from './supabaseClient.js';

const router = express.Router();

// --- helpers ---
function isValidUsername(username = '') {
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

// ------------------ USUARIOS ------------------
// === LISTAR USUARIOS ===
// helpers
function isValidRole(role) {
  return role === 'admin' || role === 'user';
}

function strongRandomPassword(len = 16) {
  // Node 18+
  return require('crypto').randomBytes(len).toString('base64url').slice(0, len);
}

// === LISTAR USUARIOS (auth + profiles) ===
router.get("/users", async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) throw error;
    const authUsers = data.users || [];

    const ids = authUsers.map(u => u.id);
    let profiles = [];
    if (ids.length) {
      const { data: profs, error: pErr } = await supabase
        .from('profiles')
        .select('id, username, role')
        .in('id', ids);
      if (pErr) throw pErr;
      profiles = profs;
    }

    const byId = Object.fromEntries(profiles.map(p => [p.id, p]));
    const merged = authUsers.map(u => ({
      id: u.id,
      email: u.email,
      username: byId[u.id]?.username ?? '',
      role: byId[u.id]?.role ?? 'user',
    }));

    return res.json({ users: merged });
  } catch (err) {
    console.error("Error listUsers:", err);
    return res.status(500).json({ error: err.message });
  }
});

// === CREAR / EDITAR USUARIO (auth + profiles) ===
router.post("/users/upsert", async (req, res) => {
  try {
    const { id, email, password, username, role } = req.body;

    // --- Validaciones ---
    if (!email) return res.status(400).json({ error: "Email requerido" });
    if (username && !isValidUsername(username)) {
      return res.status(400).json({ error: "USERNAME_INVALID" });
    }
    if (role && !isValidRole(role)) {
      return res.status(400).json({ error: "ROLE_INVALID" });
    }

    let authUser;

    // --- Crear o actualizar usuario en Auth ---
    if (id) {
      // Actualizar usuario existente
      const attrs = {
        ...(email ? { email } : {}),
        ...(password ? { password } : {}),
        // Si cambias el email o quieres marcarlo verificado:
        ...(email ? { email_confirm: true } : {})
      };

			const { data, error } =
			  await supabaseAdmin.auth.admin.updateUserById(id, attrs);
			if (error) throw error;
			authUser = data.user;
    } else {
      // Crear nuevo usuario (autoconfirmado)
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: password || strongRandomPassword(),
        email_confirm: true, // <-- este es el correcto
        user_metadata: { created_by_admin: true },
      });
      if (error) throw error;
      authUser = data.user; // createUser sí retorna { user }
    }

    // --- Upsert perfil ---
    const profileRow = {
      id: authUser.id,
      ...(username ? { username } : {}),
      ...(role ? { role } : {}),
    };

    // Recomendación: usa un cliente con service_role para BD en este endpoint
    const { data: prof, error: pErr } = await supabase
      .from('profiles')
      .upsert(profileRow, { onConflict: 'id' })
      .select('id, username, role')
      .single();

    if (pErr) throw pErr;

    // --- Respuesta ---
    return res.json({
      user: {
        id: authUser.id,
        email: authUser.email,
        username: prof?.username ?? '',
        role: prof?.role ?? 'user',
        // Lo correcto es email_confirmed_at. confirmed_at es generada.
        email_confirmed_at: authUser.email_confirmed_at || null,
      },
    });
  } catch (err) {
    console.error("Error upsertUser:", err);
    return res.status(500).json({ error: err.message });
  }
});

// === ELIMINAR USUARIO ===
router.delete("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (error) throw error;

    return res.json({ success: true });
  } catch (err) {
    console.error("Error deleteUser:", err);
    return res.status(500).json({ error: err.message });
  }
});

// === RESETEAR CONTRASEÑA POR EMAIL ===
router.post("/user/reset-password", async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    if (!email || !newPassword) {
      return res.status(400).json({ error: "Email y nueva contraseña requeridos" });
    }

    // Buscar usuario
    const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) throw listError;

    const user = users?.users?.find((u) => u.email === email);
    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    // Actualizar contraseña
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password: newPassword,
    });
    if (error) throw error;

    return res.json({ success: true, user: data.user });
  } catch (err) {
    console.error("Error reset-password:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ------------------ MENÚ ------------------
async function handleMenu(req, res) {
  try {
    const username = req.query.username?.trim() || req.params.username?.trim();
    const roleQuery = req.query.role?.trim();
    const roleDefault = roleQuery || 'user';

    const resolved = await resolveRole({ username, roleFallback: roleDefault });
    if (resolved.error) {
      return res.status(resolved.status).json({ error: resolved.error });
    }

    const role = resolved.role;

    const { data, error } = await supabase
      .from('sidebar_menu')
      .select('*')
      .eq('enabled', true)
      .order('display_order', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });

    const menuItems = (data || []).filter(item => Array.isArray(item.roles) && item.roles.includes(role));

    // Construir árbol
    const map = new Map();
    const tree = [];
    for (const item of menuItems) map.set(item.id, { ...item, children: [] });
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
}

// ---- Endpoints de menú ----
router.get('/menu', handleMenu);            // /api/admin/menu?username=foo
router.get('/menu/:username', handleMenu); // /api/admin/menu/foo

// ------------------ CONFIG (sin cambios funcionales) ------------------
router.get('/config/menu', async (req, res) => {
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

router.use((req, res) => res.status(404).json({ error: 'Not Found' }));

export default router;
