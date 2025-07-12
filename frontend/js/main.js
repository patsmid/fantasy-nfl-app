async function loadSidebar() {
  const sidebar = document.getElementById('sidebar');
  const sidebarMobile = document.getElementById('sidebarMobileContent');

  try {
    const response = await fetch('/components/sidebar.html');
    if (!response.ok) throw new Error('No se pudo cargar el sidebar');

    const html = await response.text();
    sidebar.innerHTML = html;
    sidebarMobile.innerHTML = html;

    activateSidebarLinks();
    await loadView('config'); // Vista inicial
    setActiveSidebarItem('config');
  } catch (error) {
    console.error('Error cargando sidebar:', error);
  }
}

function activateSidebarLinks() {
  // Links del sidebar
  const links = document.querySelectorAll('#sidebar [data-view], #sidebarMobileContent [data-view]');
  links.forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const view = link.getAttribute('data-view');
      await loadView(view);
      setActiveSidebarItem(view);

      // Cierra el offcanvas móvil si está abierto
      const sidebarMobileEl = document.getElementById('sidebarMobile');
      const bsOffcanvas = bootstrap.Offcanvas.getInstance(sidebarMobileEl);
      if (bsOffcanvas) bsOffcanvas.hide();
    });
  });

  // Botón móvil
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

document.addEventListener('DOMContentLoaded', () => {
  loadSidebar();

  const btnToggleSidebar = document.getElementById('toggle-sidebar-desktop');
  const icon = btnToggleSidebar?.querySelector('i');
  const body = document.body;

  // Restaurar estado previo
  const collapsed = localStorage.getItem('sidebarCollapsed') === 'true';
  if (collapsed) {
    body.classList.add('sidebar-collapsed');
    icon?.classList.replace('bi-layout-sidebar-inset-reverse', 'bi-layout-sidebar-inset');
  }

  // Evento de toggle
  btnToggleSidebar?.addEventListener('click', () => {
    const collapsedNow = body.classList.toggle('sidebar-collapsed');
    localStorage.setItem('sidebarCollapsed', collapsedNow);

    // Cambiar ícono con animación
    icon?.classList.toggle('bi-layout-sidebar-inset-reverse', !collapsedNow);
    icon?.classList.toggle('bi-layout-sidebar-inset', collapsedNow);
  });
});
