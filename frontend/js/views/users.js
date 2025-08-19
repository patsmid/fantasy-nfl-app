import { showSuccess, showError, showConfirm } from '../../components/alerts.js';

let users = [];

export default async function () {
  const content = document.getElementById('content-container');
  content.innerHTML = renderTemplate();

  setupModal();
  await loadUsers();
}

function renderTemplate() {
  return `
    <h2>Administración de Usuarios</h2>
    <button class="btn btn-accent mb-3" id="addUserBtn">
      <i class="bi bi-plus-circle me-1"></i> Agregar Usuario
    </button>
    <table class="table table-striped align-middle">
      <thead>
        <tr>
          <th>Email</th>
          <th>Usuario</th>
          <th>Rol</th>
          <th style="width:180px">Acciones</th>
        </tr>
      </thead>
      <tbody id="userTableBody"></tbody>
    </table>
    ${renderModal()}
  `;
}

function renderModal() {
  return `
    <div class="modal fade" id="userModal" tabindex="-1" aria-labelledby="userModalLabel" aria-hidden="true">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="userModalLabel">Editar Usuario</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <form id="userForm">
              <input type="hidden" name="user_id" />
              ${renderInput('Usuario', 'username')}
              ${renderInput('Email', 'email', 'usuario@ejemplo.com', 'email')}
              ${renderInput('Contraseña (opcional)', 'password', '', 'password', false)}
              ${renderRoleSelect()}
              <div class="d-flex gap-2">
                <button type="submit" class="btn btn-success">Guardar</button>
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderInput(label, name, placeholder = '', type = 'text', required = true) {
  return `
    <div class="mb-3">
      <label class="form-label">${label}</label>
      <input type="${type}" class="form-control" name="${name}" placeholder="${placeholder}" ${required ? 'required' : ''} />
    </div>
  `;
}

function renderRoleSelect() {
  return `
    <div class="mb-3">
      <label class="form-label">Rol</label>
      <select class="form-select" name="role">
        <option value="user">user</option>
        <option value="admin">admin</option>
      </select>
    </div>
  `;
}

function setupModal() {
  const modalEl = document.getElementById('userModal');
  const modal = new bootstrap.Modal(modalEl);
  const form = document.getElementById('userForm');

  document.getElementById('addUserBtn').onclick = () => {
    form.reset();
    form.elements['user_id'].value = '';
    document.getElementById('userModalLabel').textContent = 'Agregar Usuario';
    modal.show();
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));

    const body = {
      id: data.user_id || null,
      username: (data.username || '').trim(),
      role: (data.role || '').trim(),
      email: (data.email || '').trim(),
      ...(data.password ? { password: data.password } : {}),
    };

    try {
      const res = await fetch('https://fantasy-nfl-backend.onrender.com/api/admin/users/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Error al guardar');

      showSuccess('Usuario guardado');
      modal.hide();
      await loadUsers();
    } catch (err) {
      showError('No se pudo guardar: ' + err.message);
    }
  };
}

async function loadUsers() {
  try {
    const res = await fetch('https://fantasy-nfl-backend.onrender.com/api/admin/users');
    if (!res.ok) throw new Error('Error cargando usuarios');
    const json = await res.json();
    users = json.users || [];
    renderUserList();
  } catch (err) {
    showError(err.message);
  }
}

function renderUserList() {
  const tbody = document.getElementById('userTableBody');
  tbody.innerHTML = '';

  for (const user of users) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${user.email ?? ''}</td>
      <td>${user.username ?? ''}</td>
      <td><span class="badge ${user.role === 'admin' ? 'bg-primary' : 'bg-secondary'}">${user.role}</span></td>
      <td>
        <button class="btn btn-sm btn-accent me-2"><i class="bi bi-pencil-fill"></i></button>
        <button class="btn btn-sm btn-warning me-2"><i class="bi bi-key-fill"></i></button>
        <button class="btn btn-sm btn-danger"><i class="bi bi-trash-fill"></i></button>
      </td>
    `;

    tr.querySelector('.btn-accent').onclick = () => editUser(user);
    tr.querySelector('.btn-warning').onclick = () => resetPassword(user.email);
    tr.querySelector('.btn-danger').onclick = () => deleteUser(user.id);

    tbody.appendChild(tr);
  }
}

function editUser(user) {
  if (!user) return;
  document.getElementById('userModalLabel').textContent = 'Editar Usuario';
  const form = document.getElementById('userForm');
  form.elements['user_id'].value = user.id;
  form.elements['username'].value = user.username || '';
  form.elements['email'].value = user.email || '';
  form.elements['role'].value = user.role || 'user';
  const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('userModal'));
  modal.show();
}

async function deleteUser(id) {
  const ok = await showConfirm?.('¿Seguro que deseas eliminar este usuario?') ?? confirm('¿Seguro que deseas eliminar este usuario?');
  if (!ok) return;

  try {
    const res = await fetch(`https://fantasy-nfl-backend.onrender.com/api/admin/users/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error((await res.json()).error || 'Error al eliminar');
    showSuccess('Usuario eliminado');
    await loadUsers();
  } catch (err) {
    showError('No se pudo eliminar: ' + err.message);
  }
}

async function resetPassword(email) {
  const newPassword = prompt(`Nueva contraseña para ${email}:`);
  if (!newPassword) return;

  try {
    const res = await fetch('https://fantasy-nfl-backend.onrender.com/api/admin/user/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, newPassword })
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Error en reset');
    showSuccess(`Contraseña actualizada para ${email}`);
  } catch (err) {
    showError('No se pudo resetear: ' + err.message);
  }
}
