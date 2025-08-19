import { showSuccess, showError, showConfirm } from '../components/alerts.js';

// ==========================
// utils
// ==========================
function getUsernameFromURL() {
  // Quita los slashes iniciales
  const path = window.location.pathname.replace(/^\/+/, '');
  // Devuelve solo la primera parte (por si luego usas subrutas)
  return path.split('/')[0] || '';
}

function showError(message) {
  console.error(message);
  alert(message);
}

// ==========================
// sidebar
// ==========================
async function loadSidebar(username) {
  const sidebar = document.getElementById('sidebar');
  const sidebarMobile = document.getElementById('sidebarMobileContent');

  try {
    const response = await fetch(`https://fantasy-nfl-backend.onrender.com/api/admin/menu/${username}`);

    // 🚨 Manejo de status inválidos (400 / 404)
    if (!response.ok) {
      if (response.status === 400 || response.status === 404) {
        showError('Usuario inválido. Por favor ingresa un usuario válido.');
        localStorage.removeItem('fantasyUser');
        window.location.href = '/login.html';
        return;
      }
      throw new Error(`No se pudo obtener el menú (status: ${response.status})`);
    }

    const menuTree = await response.json();

    // 🚨 Manejo de error explícito en el JSON
    if (menuTree.error === "USERNAME_INVALID") {
      showError('Usuario inválido. Por favor intenta de nuevo.');
      localStorage.removeItem('fantasyUser');
      window.location.href = '/login.html';
      return;
    }

    // -------------------------------
    // Renderizado normal del sidebar
    // -------------------------------
    const sidebarHTML = renderSidebar(menuTree);

    sidebar.innerHTML = `
      <div class="flock-logo d-none d-lg-block">🏈 Fantasy NFL</div>
      ${sidebarHTML}
      <div id="sidebar-user-block" class="mt-auto" style="margin-top: 1rem;">
        <div style="padding:0.75rem 0.5rem;border-top:1px solid rgba(255,255,255,0.03);">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:0.75rem">
            <div>
              <div style="font-weight:600">${username}</div>
              <div style="font-size:0.85rem;color:var(--text-secondary)">Conectado</div>
            </div>
            <button id="logoutBtn" class="btn btn-accent" style="white-space:nowrap">Cerrar sesión</button>
          </div>
        </div>
      </div>
    `;

    if (sidebarMobile) {
      sidebarMobile.innerHTML = `
        <div class="flock-logo">🏈 Fantasy NFL</div>
        ${sidebarHTML}
        <div style="padding:0.75rem;border-top:1px solid rgba(255,255,255,0.03);margin-top:1rem">
          <div style="display:flex;gap:0.75rem;align-items:center;justify-content:space-between">
            <div>
              <div style="font-weight:600">${username}</div>
              <div style="font-size:0.85rem;color:var(--text-secondary)">Conectado</div>
            </div>
            <button id="logoutBtnMobile" class="btn btn-accent">Cerrar sesión</button>
          </div>
        </div>
      `;
    }

    activateSidebarLinks();

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('fantasyUser');
        window.location.href = '/login.html';
      });
    }
    const logoutBtnMobile = document.getElementById('logoutBtnMobile');
    if (logoutBtnMobile) {
      logoutBtnMobile.addEventListener('click', () => {
        localStorage.removeItem('fantasyUser');
        window.location.href = '/login.html';
      });
    }

    if (Array.isArray(menuTree) && menuTree.length > 0) {
      const firstView = menuTree[0].view || (menuTree[0].children?.[0]?.view) || 'config';
      await loadView(firstView);
      setActiveSidebarItem(firstView);
    } else {
      console.warn('Menu vacío o no válido recibido del backend.');
      const content = document.getElementById('content-container');
      if (content) content.innerHTML = `<div class="container py-4"><div class="card p-3">No hay elementos de menú para este usuario.</div></div>`;
    }

  } catch (error) {
    console.error('Error cargando sidebar:', error);
    showError('Error cargando menú. Revisa la consola para más detalles.');
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

function activateSidebarLinks() {
  // Seleccionamos los links del sidebar desktop y mobile
  const links = document.querySelectorAll('#sidebar [data-view], #sidebarMobileContent [data-view]');
  links.forEach(link => {
    // quitamos listeners previos por si se vuelve a renderizar
    link.replaceWith(link.cloneNode(true));
  });

  // re-query para los clones
  const freshLinks = document.querySelectorAll('#sidebar [data-view], #sidebarMobileContent [data-view]');
  freshLinks.forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const view = link.getAttribute('data-view');
      await loadView(view);
      setActiveSidebarItem(view);

      // Cerrar offcanvas si está abierto (en móvil)
      const sidebarMobileEl = document.getElementById('sidebarMobile');
      const bsOffcanvas = bootstrap.Offcanvas.getInstance(sidebarMobileEl);
      if (bsOffcanvas) bsOffcanvas.hide();
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

// ==========================
// views
// ==========================
async function loadView(viewName) {
  if (!viewName) return;
  try {
    const viewModule = await import(`./views/${viewName}.js`);
    if (viewModule && typeof viewModule.default === 'function') {
      await viewModule.default();
    } else {
      console.warn(`Módulo de vista "${viewName}" sin export default() válido.`);
    }
  } catch (error) {
    console.error(`Error cargando vista ${viewName}:`, error);
    // Opcional: mostrar alerta o contenido fallback
    const content = document.getElementById('content-container');
    if (content) content.innerHTML = `<div class="container py-4"><div class="card p-3">No se pudo cargar la vista "${viewName}". Revisa la consola.</div></div>`;
  }
}

function setActiveSidebarItem(viewName) {
  // Activamos el link en desktop y mobile
  document.querySelectorAll('[data-view]').forEach(link => {
    link.classList.toggle('active', link.getAttribute('data-view') === viewName);
  });
}

// ==========================
// init
// ==========================
document.addEventListener('DOMContentLoaded', async () => {
  // Intentamos obtener usuario de localStorage
  const username = localStorage.getItem('fantasyUser');

  if (!username) {
    // Si no hay usuario → mandamos al login
    // Si ya estás en login.html no redirigimos para evitar bucle
    if (!window.location.pathname.endsWith('/login.html')) {
      window.location.href = '/login.html';
    }
    return;
  }

  // Cargamos sidebar con el usuario
  await loadSidebar(username);

  // Botón de toggle para escritorio
  const toggleDesktopBtn = document.getElementById('toggle-sidebar-desktop');
  const sidebarIcon = document.getElementById('sidebar-icon');

  if (toggleDesktopBtn) {
    toggleDesktopBtn.addEventListener('click', () => {
      const sidebar = document.getElementById('sidebar');
      const content = document.getElementById('content-container');
      const topbar = document.querySelector('.navbar.flock-topbar');

      sidebar.classList.toggle('sidebar-hidden');

      if (sidebar.classList.contains('sidebar-hidden')) {
        content.style.marginLeft = '0';
        topbar.style.left = '0';

        if (sidebarIcon) {
          sidebarIcon.classList.remove('bi-arrow-left');
          sidebarIcon.classList.add('bi-list');
        }

        toggleDesktopBtn.classList.remove('sidebar-open');
      } else {
        content.style.marginLeft = '250px';
        topbar.style.left = '250px';

        if (sidebarIcon) {
          sidebarIcon.classList.remove('bi-list');
          sidebarIcon.classList.add('bi-arrow-left');
        }

        toggleDesktopBtn.classList.add('sidebar-open');
      }
    });
  }
});
