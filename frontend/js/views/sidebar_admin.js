import { showSuccess, showError, showConfirm } from '../../components/alerts.js';

let menuItems = [];

export default async function () {
  const container = document.getElementById('content-container');
  container.innerHTML = `
    <div class="container mt-4">
      <h2>Administración del Menú Lateral</h2>
      <button class="btn btn-primary mb-3" id="addMenuBtn">➕ Agregar Ítem</button>
      <ul id="menuList" class="list-group"></ul>
    </div>

    <!-- Modal -->
    <div class="modal fade" id="menuModal" tabindex="-1" aria-labelledby="menuModalLabel" aria-hidden="true">
      <div class="modal-dialog">
        <div class="modal-content">
          <form id="menuForm">
            <div class="modal-header">
              <h5 class="modal-title" id="menuModalLabel">Agregar Ítem</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <input type="hidden" name="id" />
              <div class="mb-2">
                <label class="form-label">Título</label>
                <input name="title" class="form-control" required />
              </div>
              <div class="mb-2">
                <label class="form-label">Ícono</label>
                <input name="icon" class="form-control" list="iconList" required />
                <datalist id="iconList">
                  <option value="bi-house" />
                  <option value="bi-gear" />
                  <option value="bi-people" />
                  <option value="bi-clipboard" />
                  <option value="bi-tools" />
                  <option value="bi-table" />
                </datalist>
              </div>
              <div class="mb-2">
                <label class="form-label">Vista (view)</label>
                <input name="view" class="form-control" />
              </div>
              <div class="mb-2">
                <label class="form-label">Submenú de</label>
                <select name="parent_id" class="form-select">
                  <option value="">Ninguno</option>
                </select>
              </div>
              <div class="mb-2">
                <label class="form-label">Roles (separados por coma)</label>
                <input name="roles" class="form-control" placeholder="admin,editor" />
              </div>
              <div class="mb-2">
                <label class="form-label">Orden</label>
                <input name="display_order" type="number" class="form-control" value="0" />
              </div>
              <div class="form-check mb-2">
                <input name="enabled" class="form-check-input" type="checkbox" checked />
                <label class="form-check-label">Habilitado</label>
              </div>
            </div>
            <div class="modal-footer">
              <button type="submit" class="btn btn-success">Guardar</button>
              <button type="button" class="btn btn-secondary btn-close" data-bs-dismiss="modal">Cerrar</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  await loadMenuItems();
  setupModal();
  setupSortable();
}

async function loadMenuItems() {
  const res = await fetch('/api/menu/list');
  menuItems = await res.json();
  const list = document.getElementById('menuList');
  list.innerHTML = '';

  for (const item of menuItems.filter(i => !i.parent_id)) {
    const li = document.createElement('li');
    li.className = 'list-group-item d-flex justify-content-between align-items-center';
    li.dataset.id = item.id;
    li.innerHTML = `
      <div>
        <i class="bi ${item.icon} me-2"></i>${item.title}
        ${!item.enabled ? '<span class="badge bg-secondary ms-2">Deshabilitado</span>' : ''}
      </div>
      <div>
        <button class="btn btn-sm btn-outline-primary me-1 edit-btn">✏️</button>
        <button class="btn btn-sm btn-outline-danger delete-btn">🗑️</button>
      </div>
    `;
    list.appendChild(li);

    li.querySelector('.edit-btn').onclick = () => editMenu(item.id);
    li.querySelector('.delete-btn').onclick = () => deleteMenu(item.id);
  }
}

function setupModal() {
  const modalEl = document.getElementById('menuModal');
  const modal = new bootstrap.Modal(modalEl);
  const form = document.getElementById('menuForm');
  const parentSelect = form.querySelector('[name=parent_id]');
  const modalTitle = modalEl.querySelector('.modal-title');

  document.getElementById('addMenuBtn').onclick = () => {
    form.reset();
    form.id.value = '';
    modalTitle.textContent = 'Agregar Ítem';
    modal.show();
    updateParentSelect();
  };

  document.querySelector('#menuModal .btn-close').onclick = () => {
    modal.hide();
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    data.roles = data.roles ? data.roles.split(',').map(r => r.trim()) : [];
    data.enabled = form.enabled.checked;
    data.parent_id = data.parent_id || null;
    data.id = data.id || null;
    data.display_order = parseInt(data.display_order) || 0;

    const res = await fetch('/api/menu/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    const json = await res.json();
    if (res.ok) {
      showSuccess('Ítem guardado');
      modal.hide();
      await loadMenuItems();
    } else {
      showError('Error al guardar: ' + json.error);
    }
  };

  function updateParentSelect() {
    parentSelect.innerHTML = '<option value="">Ninguno</option>';
    for (const item of menuItems.filter(i => !i.parent_id)) {
      parentSelect.innerHTML += `<option value="${item.id}">${item.title}</option>`;
    }
  }
}

function editMenu(id) {
  const item = menuItems.find(i => i.id === id);
  if (!item) return;
  const form = document.getElementById('menuForm');
  const modalEl = document.getElementById('menuModal');
  const modal = new bootstrap.Modal(modalEl);
  const modalTitle = modalEl.querySelector('.modal-title');
  modalTitle.textContent = 'Editar Ítem';

  form.id.value = item.id;
  form.title.value = item.title;
  form.icon.value = item.icon;
  form.view.value = item.view || '';
  form.parent_id.value = item.parent_id || '';
  form.roles.value = item.roles.join(', ');
  form.display_order.value = item.display_order;
  form.enabled.checked = item.enabled;

  modal.show();
}

async function deleteMenu(id) {
  const confirm = await showConfirm('¿Eliminar ítem del menú?');
  if (!confirm) return;
  const res = await fetch(`/api/menu/delete/${id}`, { method: 'DELETE' });
  if (res.ok) {
    showSuccess('Ítem eliminado');
    await loadMenuItems();
  } else {
    showError('Error al eliminar');
  }
}

function setupSortable() {
  const list = document.getElementById('menuList');
  Sortable.create(list, {
    animation: 150,
    onEnd: async () => {
      const order = Array.from(list.children).map((el, index) => ({
        id: parseInt(el.dataset.id),
        display_order: index
      }));
      const res = await fetch('/api/menu/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order })
      });
      if (!res.ok) showError('Error al reordenar');
    }
  });
}
