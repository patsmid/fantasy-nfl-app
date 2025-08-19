// =============================
// SIDEBAR
// =============================
async function loadSidebar(username) {
  const sidebar = document.getElementById('sidebar');
  const sidebarMobile = document.getElementById('sidebarMobileContent');

  try {
    const response = await fetch(`https://fantasy-nfl-backend.onrender.com/admin/menu/${username}`);
    if (!response.ok) throw new Error('No se pudo obtener el menú');

    const menuTree = await response.json();
    const sidebarHTML = renderSidebar(menuTree);

    sidebar.innerHTML = `<div class="flock-logo d-none d-lg-block">🏈 Fantasy NFL</div>${sidebarHTML}`;
    sidebarMobile.innerHTML = `<div class="flock-logo">🏈 Fantasy NFL</div>${sidebarHTML}`;

    activateSidebarLinks();
    await loadView('config');
    setActiveSidebarItem('config');
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
  const links = document.querySelectorAll('#sidebar [data-view], #sidebarMobileContent [data-view]');
  links.forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const view = link.getAttribute('data-view');
      history.pushState({ view }, '', `/${currentUsername}/${view}`); // SPA URL
      await loadView(view);
      setActiveSidebarItem(view);

      const sidebarMobileEl = document.getElementById('sidebarMobile');
      const bsOffcanvas = bootstrap.Offcanvas.getInstance(sidebarMobileEl);
      if (bsOffcanvas) bsOffcanvas.hide();
    });
  });

  const toggleBtn = document.getElementById('toggle-sidebar');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const offcanvas = new bootstrap.Offcanvas('#sidebarMobile');
      offcanvas.show();
    });
  }
}

async function loadView(viewName) {
  try {
    const viewModule = await import(`./views/${viewName}.js`);
    await viewModule.default();
  } catch (error) {
    console.error(`Error cargando vista ${viewName}:`, error);
  }
}

function setActiveSidebarItem(viewName) {
  document.querySelectorAll('[data-view]').forEach(link => {
    link.classList.toggle('active', link.getAttribute('data-view') === viewName);
  });
}

// =============================
// SPA Routing Helpers
// =============================
let currentUsername = null;

function getUsernameFromURL() {
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  return pathParts[0] || null;
}

async function initApp() {
  currentUsername = getUsernameFromURL();
  if (!currentUsername) {
    console.warn("⚠️ No se encontró username en la URL");
    return;
  }
  await loadSidebar(currentUsername);

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
}

// =============================
// INICIO
// =============================
document.addEventListener('DOMContentLoaded', initApp);

// Maneja navegación SPA con botones de navegador
window.addEventListener('popstate', async () => {
  const username = getUsernameFromURL();
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const view = pathParts[1] || 'config';

  if (username !== currentUsername) {
    currentUsername = username;
    await loadSidebar(currentUsername);
  } else {
    await loadView(view);
    setActiveSidebarItem(view);
  }
});
