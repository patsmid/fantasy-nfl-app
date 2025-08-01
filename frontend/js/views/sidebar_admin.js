// sidebar_admin.js

import { showSuccess, showError } from '../../components/alerts.js';

let menuItems = [];

export default async function () {
  const content = document.getElementById('content-container');
  content.innerHTML = renderTemplate();

  await loadMenuItems();
  setupModal();
  setupSortable(); // ahora también incluye submenús
}

function renderTemplate() {
  return `
    <h2>Administración del Menú</h2>
    <button class="btn btn-primary mb-3" id="addMenuBtn">➕ Agregar Ítem</button>
    <ul id="menuList" class="list-group mb-5"></ul>
    ${renderModal()}
  `;
}

function renderModal() {
  return `
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
              ${renderInput('Título', 'title')}
              ${renderInput('Vista (view)', 'view')}
              ${renderInput('Ícono (Bootstrap icon)', 'icon', 'bi-house, bi-tools')}
              <div class="mb-3">
                <label class="form-label">Submenú de:</label>
                <select class="form-select" name="parent_id">
                  <option value="">(ninguno)</option>
                </select>
              </div>
              ${renderInput('Roles', 'roles', 'admin,editor')}
              ${renderInput('Orden', 'display_order', '', 'number')}
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
}

function renderInput(label, name, placeholder = '', type = 'text') {
  return `
    <div class="mb-3">
      <label class="form-label">${label}</label>
      <input type="${type}" class="form-control" name="${name}" placeholder="${placeholder}" />
    </div>
  `;
}

function setupModal() {
  const modalEl = document.getElementById('menuModal');
  const modal = new bootstrap.Modal(modalEl);
  const form = document.getElementById('menuForm');
  const parentSelect = form.querySelector('[name=parent_id]');

  document.getElementById('addMenuBtn').onclick = () => {
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
      const res = await fetch('https://fantasy-nfl-backend.onrender.com/admin/menu/upsert', {
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

  modalEl.addEventListener('show.bs.modal', () => {
    parentSelect.innerHTML = '<option value="">(ninguno)</option>';
    menuItems.filter(i => !i.parent_id).forEach(item => {
      parentSelect.innerHTML += `<option value="${item.id}">${item.title}</option>`;
    });
  });
}

async function loadMenuItems() {
  try {
    const res = await fetch('https://fantasy-nfl-backend.onrender.com/admin/menu/config');
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
    const li = createMenuItem(item);

    // hijos anidados
    const subList = document.createElement('ul');
    subList.className = 'list-group list-group-flush ms-4';
    subList.dataset.parentId = item.id;

    const children = menuItems
      .filter(child => child.parent_id === item.id)
      .sort((a, b) => a.display_order - b.display_order);

    for (const child of children) {
      const subLi = createMenuItem(child);
      subList.appendChild(subLi);
    }

    li.appendChild(subList);
    list.appendChild(li);
  }
}

function createMenuItem(item) {
  const li = document.createElement('li');
  li.className = 'list-group-item d-flex justify-content-between align-items-center';
  li.dataset.id = item.id;
  li.dataset.parentId = item.parent_id || '';
  li.innerHTML = `
    <div><i class="bi ${item.icon} me-2"></i> ${item.title}</div>
    <div><button class="btn btn-sm btn-secondary me-2">Editar</button></div>
  `;
  li.querySelector('button').onclick = () => editMenu(item.id);
  return li;
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
  const parentList = document.getElementById('menuList');

  // Sortable para la lista principal
  Sortable.create(parentList, {
    animation: 150,
    handle: '.list-group-item',
    group: 'nested',
    onEnd: saveOrder
  });

  // Sortable para cada submenú
  const subLists = parentList.querySelectorAll('ul[data-parent-id]');
  subLists.forEach(sub => {
    Sortable.create(sub, {
      animation: 150,
      group: 'nested',
      onEnd: saveOrder
    });
  });
}

async function saveOrder() {
  const allItems = [];

  const parentList = document.getElementById('menuList');
  [...parentList.children].forEach((li, index) => {
    if (!li.dataset.id) return;

    const id = parseInt(li.dataset.id);
    allItems.push({ id, display_order: index, parent_id: null });

    const subList = li.querySelector('ul[data-parent-id]');
    if (subList) {
      [...subList.children].forEach((subLi, subIndex) => {
        if (!subLi.dataset.id) return;
        allItems.push({
          id: parseInt(subLi.dataset.id),
          display_order: subIndex,
          parent_id: id
        });
      });
    }
  });

  try {
    const res = await fetch('https://fantasy-nfl-backend.onrender.com/admin/menu/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(allItems)
    });
    if (!res.ok) throw new Error('Error al guardar orden');
    showSuccess('Orden actualizado');
  } catch (err) {
    showError(err.message);
  }
}
