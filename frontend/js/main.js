// =============================
// Obtiene y renderiza el sidebar según el usuario logueado
// =============================
async function loadSidebar(username, initialView = 'config') {
  const sidebar = document.getElementById('sidebar');
  const sidebarMobile = document.getElementById('sidebarMobileContent');

  try {
    // 🔑 Pedimos menú basado en username
    const response = await fetch(`https://fantasy-nfl-backend.onrender.com/admin/menu/${username}`);
    if (!response.ok) throw new Error('No se pudo obtener el menú');

    const menuTree = await response.json();

    const sidebarHTML = renderSidebar(menuTree, username);
    sidebar.innerHTML = `<div class="flock-logo d-none d-lg-block">🏈 Fantasy NFL</div>${sidebarHTML}`;
    sidebarMobile.innerHTML = `<div class="flock-logo">🏈 Fantasy NFL</div>${sidebarHTML}`;

    // cargar vista inicial
    await loadView(username, initialView);
    setActiveSidebarItem(initialView);

  } catch (error) {
    console.error('Error cargando sidebar:', error);
  }
}

function renderSidebar(menuTree, username) {
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
              <a href="/${username}?view=${child.view}" class="nav-link">
                <i class="bi ${child.icon}"></i> <span>${child.title}</span>
              </a>
            </li>
          `).join('')}
        </ul>
      `;
    } else {
      li.innerHTML = `
        <a href="/${username}?view=${item.view}" class="nav-link">
          <i class="bi ${item.icon}"></i>
          <span>${item.title}</span>
        </a>
      `;
    }

    ul.appendChild(li);
  }

  return ul.outerHTML;
}

async function loadView(username, viewName) {
  try {
    const viewModule = await import(`./views/${viewName}.js`);
    await viewModule.default(username);
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
// INICIO - Carga inicial
// =============================
document.addEventListener('DOMContentLoaded', async () => {
  // 🔑 Detectar username desde la URL
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  let username = pathParts[0] || 'demo1';

  // 🔑 Detectar vista desde query param ?view=...
  const params = new URLSearchParams(window.location.search);
  let view = params.get('view') || 'config';

  await loadSidebar(username, view);

  // Toggle Sidebar Desktop
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
