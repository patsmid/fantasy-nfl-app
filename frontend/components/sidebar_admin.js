// sidebar_admin.js
const menuList = document.getElementById('menu-list');
const modal = new bootstrap.Modal(document.getElementById('menuModal'));
const form = document.getElementById('menu-form');
const iconSelect = document.getElementById('menu-icon');
const parentSelect = document.getElementById('menu-parent');

let currentMenus = [];

async function fetchMenus() {
  const res = await fetch('/api/menu/admin'); // endpoint especial para admin
  const data = await res.json();
  currentMenus = data;
  renderMenus(data);
  fillParentOptions(data);
}

function renderMenus(menus) {
  menuList.innerHTML = '';
  for (const item of menus) {
    const li = document.createElement('li');
    li.className = 'list-group-item d-flex justify-content-between align-items-center';
    li.dataset.id = item.id;
    li.innerHTML = `
      <div>
        <i class="bi ${item.icon}"></i> ${item.title}
        <small class="text-muted">[${item.roles.join(', ')}]</small>
      </div>
      <div>
        <button class="btn btn-sm btn-outline-secondary me-2" onclick="editMenu(${item.id})">Editar</button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteMenu(${item.id})">Eliminar</button>
      </div>
    `;
    menuList.appendChild(li);
  }

  new Sortable(menuList, {
    animation: 150,
    onEnd: saveOrder
  });
}

function fillParentOptions(menus) {
  parentSelect.innerHTML = '<option value="">(ninguno)</option>';
  for (const item of menus) {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = item.title;
    parentSelect.appendChild(opt);
  }
}

function editMenu(id) {
  const item = currentMenus.find(m => m.id === id);
  if (!item) return;
  document.getElementById('menu-id').value = item.id;
  document.getElementById('menu-title').value = item.title;
  document.getElementById('menu-view').value = item.view || '';
  document.getElementById('menu-icon').value = item.icon;
  document.getElementById('menu-parent').value = item.parent_id || '';
  document.getElementById('menu-enabled').checked = item.enabled;

  const rolesSelect = document.getElementById('menu-roles');
  for (const opt of rolesSelect.options) {
    opt.selected = item.roles.includes(opt.value);
  }

  modal.show();
}

document.getElementById('btn-add-menu').addEventListener('click', () => {
  form.reset();
  document.getElementById('menu-id').value = '';
  modal.show();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('menu-id').value;
  const payload = {
    title: document.getElementById('menu-title').value,
    view: document.getElementById('menu-view').value || null,
    icon: iconSelect.value,
    parent_id: parentSelect.value || null,
    enabled: document.getElementById('menu-enabled').checked,
    roles: Array.from(document.getElementById('menu-roles').selectedOptions).map(o => o.value)
  };

  const method = id ? 'PUT' : 'POST';
  const url = id ? `/api/menu/${id}` : '/api/menu';

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (res.ok) {
    await fetchMenus();
    modal.hide();
  } else {
    alert('Error al guardar.');
  }
});

async function deleteMenu(id) {
  if (!confirm('Eliminar este menú?')) return;
  const res = await fetch(`/api/menu/${id}`, { method: 'DELETE' });
  if (res.ok) fetchMenus();
  else alert('Error al eliminar.');
}

async function saveOrder() {
  const items = Array.from(menuList.children);
  const updates = items.map((li, index) => ({ id: li.dataset.id, order: index + 1 }));
  await fetch('/api/menu/reorder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  await fetchMenus();
}

// Inicial
fetchMenus();
