// sidebar_admin.js

import { showSuccess, showError, showConfirm } from '../../components/alerts.js';

let menuItems = [];

export default async function () {
  const content = document.getElementById('content-container');
  content.innerHTML = `
    <h2>Administración del Menú</h2>
    <button class="btn btn-primary mb-3" id="addMenuBtn">➕ Agregar Ítem</button>
    <ul id="menuList" class="list-group mb-5"></ul>

    <!-- Modal -->
    <div class="modal fade" id="menuModal" tabindex="-1" aria-labelledby="menuModalLabel" aria-hidden="true">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="menuModalLabel">Editar Ítem</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <form id="menuForm">
              <input type="hidden" name="id" />
              <div class="mb-3">
                <label class="form-label">Título</label>
                <input type="text" class="form-control" name="title" required />
              </div>
              <div class="mb-3">
                <label class="form-label">Vista (view)</label>
                <input type="text" class="form-control" name="view" />
              </div>
              <div class="mb-3">
                <label class="form-label">Ícono (Bootstrap icon)</label>
                <input type="text" class="form-control" name="icon" placeholder="bi-house, bi-tools, etc." />
              </div>
              <div class="mb-3">
                <label class="form-label">Submenú de:</label>
                <select class="form-select" name="parent_id">
                  <option value="">(ninguno)</option>
                </select>
              </div>
              <div class="mb-3">
                <label class="form-label">Roles</label>
                <input type="text" class="form-control" name="roles" placeholder="Separar por comas: admin,editor" />
              </div>
              <div class="mb-3">
                <label class="form-label">Orden</label>
                <input type="number" class="form-control" name="display_order" />
              </div>
              <div class="form-check mb-3">
                <input class="form-check-input" type="checkbox" name="enabled" id="enabledCheckbox">
                <label class="form-check-label" for="enabledCheckbox">Activo</label>
              </div>
              <button type="submit" class="btn btn-success">Guardar</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  `;

  await loadMenuItems();
  setupModal();
  setupSortable();
}

function setupModal() {
  const addBtn = document.getElementById('addMenuBtn');
  const modalEl = document.getElementById('menuModal');
  const modal = new bootstrap.Modal(modalEl);
  const form = document.getElementById('menuForm');
  const parentSelect = form.querySelector('[name=parent_id]');

  addBtn.onclick = () => {
    form.reset();
    form.id.value = '';
    modal.show();
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));

    const body = {
      id: data.id || null,
      title: data.title,
      icon: data.icon,
      view: data.view || null,
      parent_id: data.parent_id || null,
      roles: data.roles.split(',').map(r => r.trim()).filter(Boolean),
      display_order: parseInt(data.display_order || '0'),
      enabled: form.enabled.checked,
    };

    try {
      const res = await fetch('https://fantasy-nfl-backend.onrender.com/menu/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) throw new Error('Error al guardar');

      showSuccess('Menú guardado');
      modal.hide();
      await loadMenuItems();
    } catch (err) {
      showError('No se pudo guardar: ' + err.message);
    }
  };

  // Popular opciones parent_id
  const renderParentOptions = () => {
    parentSelect.innerHTML = '<option value="">(ninguno)</option>';
    menuItems.filter(i => !i.parent_id).forEach(item => {
      parentSelect.innerHTML += `<option value="${item.id}">${item.title}</option>`;
    });
  };

  modalEl.addEventListener('show.bs.modal', renderParentOptions);
}

async function loadMenuItems() {
  try {
    const res = await fetch('https://fantasy-nfl-backend.onrender.com/menu');
    if (!res.ok) throw new Error('Error cargando menú');
    menuItems = await res.json();
    renderMenuList();
  } catch (err) {
    showError(err.message);
  }
}

function renderMenuList() {
  const list = document.getElementById('menuList');
  list.innerHTML = '';
  const parents = menuItems.filter(i => !i.parent_id).sort((a, b) => a.display_order - b.display_order);

  for (const item of parents) {
    const li = document.createElement('li');
    li.className = 'list-group-item d-flex justify-content-between align-items-center';
    li.dataset.id = item.id;
    li.innerHTML = `
      <div><i class="bi ${item.icon} me-2"></i> ${item.title}</div>
      <div>
        <button class="btn btn-sm btn-secondary me-2" onclick="editMenu(${item.id})">Editar</button>
      </div>
    `;
    list.appendChild(li);
  }
}

function editMenu(id) {
  const item = menuItems.find(i => i.id === id);
  if (!item) return;
  const form = document.getElementById('menuForm');
  form.id.value = item.id;
  form.title.value = item.title;
  form.icon.value = item.icon;
  form.view.value = item.view || '';
  form.parent_id.value = item.parent_id || '';
  form.roles.value = item.roles.join(', ');
  form.display_order.value = item.display_order;
  form.enabled.checked = item.enabled;
  new bootstrap.Modal('#menuModal').show();
}

function setupSortable() {
  const menuList = document.getElementById('menuList');
  new Sortable(menuList, {
    animation: 150,
    onEnd: async () => {
      const ids = [...menuList.children].map(li => parseInt(li.dataset.id));
      const ordered = ids.map((id, index) => ({ id, display_order: index }));

      try {
        const res = await fetch('https://fantasy-nfl-backend.onrender.com/menu/order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ordered)
        });
        if (!res.ok) throw new Error('Error al guardar orden');
        showSuccess('Orden actualizado');
      } catch (err) {
        showError(err.message);
      }
    }
  });
}
