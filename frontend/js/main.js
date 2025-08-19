// main.js (ESM)

// =============================
// Config
// =============================
const BACKEND_BASE = 'https://fantasy-nfl-backend.onrender.com';

// =============================
// Utils
// =============================
function getParams() {
  return new URLSearchParams(window.location.search);
}

function setParamInURL(paramsObj = {}) {
  const params = getParams();
  Object.entries(paramsObj).forEach(([k, v]) => {
    if (v === null || v === undefined) params.delete(k);
    else params.set(k, v);
  });
  const newUrl = `${window.location.pathname}?${params.toString()}`;
  history.pushState(paramsObj, '', newUrl);
}

function resolveInitialUsername() {
  const params = getParams();
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const isAdminRoute = pathParts[0] === 'admin';

  // Prioridades: ?u= -> localStorage -> path (si no es /admin) -> demo1
  return (
    params.get('u') ||
    localStorage.getItem('username') ||
    (!isAdminRoute ? (pathParts[0] || null) : null) ||
    'demo1'
  );
}

function resolveInitialView() {
  const params = getParams();
  return params.get('view') || 'config';
}

// =============================
// Backend
// =============================
async function fetchMenu({ username, roleFallback = 'user' } = {}) {
  // 1) Primero intentamos por username
  if (username) {
    let res = await fetch(`${BACKEND_BASE}/admin/menu?username=${encodeURIComponent(username)}`);
    // 404 -> usuario no encontrado: pedimos menú por rol (seguro)
    if (res.status === 404) {
      res = await fetch(`${BACKEND_BASE}/admin/menu?role=${encodeURIComponent(roleFallback)}`);
    }
    if (!res.ok) throw new Error('No se pudo obtener el menú');
    return res.json();
  }

  // 2) Sin username: menú por rol
  const res = await fetch(`${BACKEND_BASE}/admin/menu?role=${encodeURIComponent(roleFallback)}`);
  if (!res.ok) throw new Error('No se pudo obtener el menú');
  return res.json();
}

// =============================
// Sidebar
// =============================
async function loadSidebar(username, initialView = 'config') {
  const sidebar = document.getElementById('sidebar');
  const sidebarMobile = document.getElementById('sidebarMobileContent');

  try {
    const menuTree = await fetchMenu({ username, roleFallback: 'user' });

    const sidebarHTML = renderSidebar(menuTree);
    if (sidebar) sidebar.innerHTML = `<div class="flock-logo d-none d-lg-block">🏈 Fantasy NFL</div>${sidebarHTML}`;
    if (sidebarMobile) sidebarMobile.innerHTML = `<div class="flock-logo">🏈 Fantasy NFL</div>${sidebarHTML}`;

    activateSidebarLinks(username);

    // Carga vista inicial
    await loadView(initialView, username);
    setActiveSidebarItem(initialView);

  } catch (error) {
    console.error('Error cargando sidebar:', error);
  }
}

function renderSidebar(menuTree) {
  const ul = document.createElement('ul');
  ul.className = 'nav flex-column flock-nav';

  for (const item of menuTree) {
    const li = document.createElement('li');
    li.className = 'nav-item';

    const hasChildren = item.children && item.children.length > 0;

    if (hasChildren) {
      const submenuId = `submenu-${item.id}`;
      li.innerHTML = `
        <a href="#" class="nav-link d-flex justify-content-between align-items-center" data-bs-toggle="collapse" data-bs-target="#${submenuId}">
          <span><i class="bi ${item.icon}"></i> ${item.title}</span>
          <i class="bi bi-caret-down-fill small"></i>
        </a>
        <ul class="nav flex-column ms-3 collapse" id="${submenuId}">
          ${item.children.map(child => `
            <li class="nav-item">
              <a href="#" class="nav-link" data-view="${child.view}">
                <i class="bi ${child.icon}"></i> <span>${child.title}</span>
              </a>
            </li>
          `).join('')}
        </ul>
      `;
    } else {
      li.innerHTML = `
        <a href="#" class="nav-link" data-view="${item.view}">
          <i class="bi ${item.icon}"></i>
          <span>${item.title}</span>
        </a>
      `;
    }

    ul.appendChild(li);
  }

  return ul.outerHTML;
}

function activateSidebarLinks(username) {
  // Desktop + Mobile
  const links = document.querySelectorAll('#sidebar [data-view], #sidebarMobileContent [data-view]');
  links.forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const view = link.getAttribute('data-view');

      // Actualiza URL (?view=&u=) sin recargar
      setParamInURL({ view, u: username });

      await loadView(view, username);
      setActiveSidebarItem(view);

      // Cerrar offcanvas si está abierto (móvil)
      const sidebarMobileEl = document.getElementById('sidebarMobile');
      if (sidebarMobileEl) {
        const bsOffcanvas = bootstrap.Offcanvas.getInstance(sidebarMobileEl) || new bootstrap.Offcanvas(sidebarMobileEl);
        if (bsOffcanvas) bsOffcanvas.hide();
      }
    });
  });

  // Botón hamburguesa para móvil
  const toggleBtn = document.getElementById('toggle-sidebar');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const offcanvas = new bootstrap.Offcanvas('#sidebarMobile');
      offcanvas.show();
    });
  }
}

// =============================
// Carga de vistas
// =============================
async function loadView(viewName, username) {
  try {
    const viewModule = await import(`./views/${viewName}.js`);
    // Pasa username a la vista (opcional según cada vista)
    if (typeof viewModule.default === 'function') {
      await viewModule.default(username);
    }
  } catch (error) {
    console.error(`Error cargando vista ${viewName}:`, error);
    // Aquí podrías mostrar una alerta visual si quieres
  }
}

function setActiveSidebarItem(viewName) {
  document.querySelectorAll('[data-view]').forEach(link => {
    link.classList.toggle('active', link.getAttribute('data-view') === viewName);
  });
}

// Soporte de navegación con botones atrás/adelante
window.addEventListener('popstate', () => {
  const view = resolveInitialView();
  const username = resolveInitialUsername();
  loadView(view, username);
  setActiveSidebarItem(view);
});

// =============================
// INICIO - Carga inicial
// =============================
document.addEventListener('DOMContentLoaded', async () => {
  const username = resolveInitialUsername();
  const view = resolveInitialView();

  // Guarda username para siguientes visitas
  localStorage.setItem('username', username);

  await loadSidebar(username, view);

  // Toggle Sidebar Desktop
  const toggleDesktopBtn = document.getElementById('toggle-sidebar-desktop');
  const sidebarIcon = document.getElementById('sidebar-icon');

  if (toggleDesktopBtn) {
    toggleDesktopBtn.addEventListener('click', () => {
      const sidebar = document.getElementById('sidebar');
      const content = document.getElementById('content-container');
      const topbar = document.querySelector('.navbar.flock-topbar');

      if (!sidebar || !content || !topbar) return;

      sidebar.classList.toggle('sidebar-hidden');

      if (sidebar.classList.contains('sidebar-hidden')) {
        content.style.marginLeft = '0';
        topbar.style.left = '0';

        if (sidebarIcon) {
          sidebarIcon.classList.remove('bi-arrow-left');
          sidebarIcon.classList.add('bi-list');
        }
        toggleDesktopBtn.classList.remove('sidebar-open'); // sidebar cerrado
      } else {
        content.style.marginLeft = '250px';
        topbar.style.left = '250px';

        if (sidebarIcon) {
          sidebarIcon.classList.remove('bi-list');
          sidebarIcon.classList.add('bi-arrow-left');
        }
        toggleDesktopBtn.classList.add('sidebar-open'); // sidebar abierto, clase naranja
      }
    });
  }
});
