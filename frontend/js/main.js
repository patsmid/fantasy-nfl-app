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
    await loadView('players'); // Vista inicial
    setActiveSidebarItem('players');
  } catch (error) {
    console.error('Error cargando sidebar:', error);
  }
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

document.addEventListener('DOMContentLoaded', () => {
  loadSidebar();
});
