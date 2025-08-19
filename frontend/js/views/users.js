import { showSuccess, showError, showConfirm } from '../../components/alerts.js';

let users = [];

export default async function () {
  const content = document.getElementById('content-container');
  content.innerHTML = renderTemplate();

  setupModalsAndEvents();
  await loadUsers();
}

function renderTemplate() {
  return `
  <div class="card border-0 shadow-sm rounded flock-card">
    <div class="card-body">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h5 class="m-0 d-flex align-items-center gap-2">
          <i class="bi bi-people-fill text-primary"></i> Administración de Usuarios
        </h5>
        <button class="btn btn-sm btn-primary" id="addUserBtn">
          <i class="bi bi-plus-circle me-1"></i> Agregar
        </button>
      </div>
      <div class="table-responsive">
        <table id="usersTable" class="table table-dark table-hover align-middle w-100">
          <thead class="table-dark">
            <tr>
              <th>Email</th>
              <th>Usuario</th>
              <th>Rol</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody id="userTableBody"></tbody>
        </table>
      </div>
    </div>
  </div>

  ${renderUserModal()}
  ${renderResetModal()}
  `;
}

/* ---------- Modales ---------- */

function renderUserModal() {
  return `
  <div class="modal fade" id="userModal" tabindex="-1">
    <div class="modal-dialog modal-dialog-centered modal-fullscreen-sm-down">
      <form class="modal-content bg-dark text-white border border-secondary rounded" id="userForm">
        <div class="modal-header border-bottom border-secondary">
          <h5 class="modal-title" id="userModalLabel">Usuario</h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body">
          <input type="hidden" name="user_id" />
          ${renderInput('Usuario', 'username')}
          ${renderInput('Email', 'email', 'usuario@ejemplo.com', 'email')}
          ${renderInput('Contraseña (opcional)', 'password', '', 'password', false)}
          ${renderRoleSelect()}
        </div>
        <div class="modal-footer border-top border-secondary">
          <button type="submit" class="btn btn-success">Guardar</button>
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
        </div>
      </form>
    </div>
  </div>
  `;
}

function renderResetModal() {
  return `
  <div class="modal fade" id="resetModal" tabindex="-1">
    <div class="modal-dialog modal-dialog-centered modal-sm">
      <form class="modal-content bg-dark text-white border border-secondary rounded" id="resetForm">
        <div class="modal-header border-bottom border-secondary">
          <h5 class="modal-title">Resetear contraseña</h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body">
          <input type="hidden" id="resetEmail" />
          <div class="mb-2">
            <small class="text-secondary">Usuario:</small>
            <div id="resetEmailLabel" class="fw-semibold"></div>
          </div>
          <div class="mb-3">
            <label class="form-label">Nueva contraseña</label>
            <input type="password" class="form-control" id="resetPass1" required />
          </div>
          <div class="mb-3">
            <label class="form-label">Confirmar contraseña</label>
            <input type="password" class="form-control" id="resetPass2" required />
          </div>
        </div>
        <div class="modal-footer border-top border-secondary">
          <button type="submit" class="btn btn-warning">
            <i class="bi bi-key-fill me-1"></i> Actualizar
          </button>
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
        </div>
      </form>
    </div>
  </div>
  `;
}

/* ---------- Helpers UI ---------- */

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

/* ---------- Setup eventos ---------- */

function setupModalsAndEvents() {
  // Modal usuario (crear/editar)
  const userModalEl = document.getElementById('userModal');
  const userModal = new bootstrap.Modal(userModalEl);
  const userForm = document.getElementById('userForm');

  document.getElementById('addUserBtn').onclick = () => {
    userForm.reset();
    userForm.elements['user_id'].value = '';
    document.getElementById('userModalLabel').textContent = 'Agregar Usuario';
    userModal.show();
  };

  userForm.onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(userForm));

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
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || 'Error al guardar');

      showSuccess('Usuario guardado');
      userModal.hide();
      await loadUsers();
    } catch (err) {
      showError('No se pudo guardar: ' + err.message);
    }
  };

  // Modal reset password
  const resetModalEl = document.getElementById('resetModal');
  const resetModal = new bootstrap.Modal(resetModalEl);
  const resetForm = document.getElementById('resetForm');

  resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('resetEmail').value;
    const p1 = (document.getElementById('resetPass1').value || '').trim();
    const p2 = (document.getElementById('resetPass2').value || '').trim();

    if (p1.length < 6) {
      showError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (p1 !== p2) {
      showError('Las contraseñas no coinciden.');
      return;
    }

    try {
      const res = await fetch('https://fantasy-nfl-backend.onrender.com/api/admin/user/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, newPassword: p1 })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || 'Error en reset');

      resetModal.hide();
      showSuccess(`Contraseña actualizada para ${email}`);
    } catch (err) {
      showError('No se pudo resetear: ' + err.message);
    }
  });

  // Delegación de eventos para acciones en la tabla (funciona incluso con DataTables)
  const tbody = document.getElementById('userTableBody');
  tbody.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;

    const id = btn.dataset.id;
    const email = btn.dataset.email;

    if (btn.dataset.action === 'edit') {
      const user = users.find(u => u.id === id);
      if (!user) return;
      document.getElementById('userModalLabel').textContent = 'Editar Usuario';
      userForm.elements['user_id'].value = user.id;
      userForm.elements['username'].value = user.username || '';
      userForm.elements['email'].value = user.email || '';
      userForm.elements['role'].value = user.role || 'user';
      userModal.show();
    }

    if (btn.dataset.action === 'reset') {
      document.getElementById('resetEmail').value = email;
      document.getElementById('resetEmailLabel').textContent = email;
      resetForm.reset();
      resetModal.show();
    }

    if (btn.dataset.action === 'delete') {
      const ok = await confirmDelete('¿Seguro que deseas eliminar este usuario?');
      if (!ok) return;

      try {
        const res = await fetch(`https://fantasy-nfl-backend.onrender.com/api/admin/users/${id}`, { method: 'DELETE' });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || 'Error al eliminar');
        showSuccess('Usuario eliminado');
        await loadUsers();
      } catch (err) {
        showError('No se pudo eliminar: ' + err.message);
      }
    }
  });
}

async function confirmDelete(message) {
  // Soporta showConfirm que devuelva boolean o un objeto estilo SweetAlert2 { isConfirmed: true/false }
  if (typeof showConfirm === 'function') {
    const res = await showConfirm(message);
    if (typeof res === 'boolean') return res;
    if (res && typeof res === 'object' && 'isConfirmed' in res) return !!res.isConfirmed;
    // Cualquier otro retorno lo tratamos como "no confirmado"
    return false;
  }
  return window.confirm(message);
}

/* ---------- Carga de datos ---------- */

async function loadUsers() {
  try {
    const res = await fetch('https://fantasy-nfl-backend.onrender.com/api/admin/users');
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Error cargando usuarios');
    users = json.users || [];
    renderUserList();
  } catch (err) {
    showError(err.message);
  }
}

/* ---------- Render tabla ---------- */

function renderUserList() {
  // Destruir DataTable previo ANTES de tocar el DOM para evitar estados zombis
  if ($.fn.DataTable && $.fn.DataTable.isDataTable('#usersTable')) {
    $('#usersTable').DataTable().destroy();
  }

  const tbody = document.getElementById('userTableBody');

  const rowsHtml = users.map(user => `
    <tr>
      <td>${user.email ?? ''}</td>
      <td>${user.username ?? ''}</td>
      <td><span class="badge ${user.role === 'admin' ? 'bg-primary' : 'bg-secondary'}">${user.role}</span></td>
      <td>
        <button class="btn btn-sm btn-outline-info me-1" data-action="edit" data-id="${user.id}" title="Editar">
          <i class="bi bi-pencil-square"></i>
        </button>
        <button class="btn btn-sm btn-outline-warning me-1" data-action="reset" data-id="${user.id}" data-email="${user.email}" title="Resetear contraseña">
          <i class="bi bi-key-fill"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${user.id}" title="Eliminar">
          <i class="bi bi-trash-fill"></i>
        </button>
      </td>
    </tr>
  `).join('');

  tbody.innerHTML = rowsHtml;

  // Re-inicializar DataTable con el DOM ya actualizado
  if ($.fn.DataTable) {
    $('#usersTable').DataTable({
      responsive: true,
      pageLength: 10,
      language: {
        url: '//cdn.datatables.net/plug-ins/2.3.2/i18n/es-MX.json'
      },
      dom: 'tip'
    });
  }
}
