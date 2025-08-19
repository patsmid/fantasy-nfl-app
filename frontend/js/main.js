// ==========================
// utils
// ==========================
function getUsernameFromURL() {
  // Quita los slashes iniciales
  const path = window.location.pathname.replace(/^\/+/, '');
  // Devuelve solo la primera parte (por si luego usas subrutas)
  return path.split('/')[0] || '';
}

// ==========================
// sidebar
// ==========================
async function loadSidebar(username) {
  const sidebar = document.getElementById('sidebar');
  const sidebarMobile = document.getElementById('sidebarMobileContent');

  try {
    const response = await fetch(`https://fantasy-nfl-backend.onrender.com/api/admin/menu/${username}`);
    if (!response.ok) throw new Error('No se pudo obtener el menú');

    const menuTree = await response.json();

    const sidebarHTML = renderSidebar(menuTree);
    sidebar.innerHTML = `<div class="flock-logo d-none d-lg-block">🏈 Fantasy NFL</div>${sidebarHTML}`;
    sidebarMobile.innerHTML = `<div class="flock-logo">🏈 Fantasy NFL</div>${sidebarHTML}`;

    activateSidebarLinks();

    // Cargar la primera vista disponible
    if (menuTree.length > 0) {
      const firstView = menuTree[0].view || (menuTree[0].children?.[0]?.view) || 'config';
      await loadView(firstView);
      setActiveSidebarItem(firstView);
    }

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

function activateSidebarLinks() {
  // Seleccionamos los links del sidebar desktop y mobile
  const links = document.querySelectorAll('#sidebar [data-view], #sidebarMobileContent [data-view]');
  links.forEach(link => {
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
  try {
    const viewModule = await import(`./views/${viewName}.js`);
    await viewModule.default();
  } catch (error) {
    console.error(`Error cargando vista ${viewName}:`, error);
    // Opcional: mostrar alerta o contenido fallback
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
  // Obtenemos el usuario guardado
  const username = localStorage.getItem('fantasyUser');

  if (!username) {
    // Si no hay usuario → mandamos al login
    window.location.href = "/login.html";
    return;
  }

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

        sidebarIcon.classList.remove('bi-arrow-left');
        sidebarIcon.classList.add('bi-list');

        toggleDesktopBtn.classList.remove('sidebar-open');
      } else {
        content.style.marginLeft = '250px';
        topbar.style.left = '250px';

        sidebarIcon.classList.remove('bi-list');
        sidebarIcon.classList.add('bi-arrow-left');

        toggleDesktopBtn.classList.add('sidebar-open');
      }
    });
  }
});
