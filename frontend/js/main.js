async function loadSidebar() {
  const sidebar = document.getElementById('sidebar');
  const sidebarMobile = document.getElementById('sidebarMobileContent');

  const response = await fetch('/components/sidebar.html');
  const html = await response.text();

  sidebar.innerHTML = html;
  sidebarMobile.innerHTML = html; // Copiamos contenido también para el offcanvas

  activateSidebarLinks();
  await loadView('players');
  setActiveSidebarItem('players');
}

function activateSidebarLinks() {
  const links = document.querySelectorAll('[data-view]');
  links.forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const view = link.getAttribute('data-view');
      await loadView(view);
      setActiveSidebarItem(view);

      // Oculta offcanvas en móvil
      const sidebarMobileEl = document.getElementById('sidebarMobile');
      const bsOffcanvas = bootstrap.Offcanvas.getInstance(sidebarMobileEl);
      if (bsOffcanvas) bsOffcanvas.hide();
    });
  });

  // Botón ☰ móvil
  const toggleBtn = document.getElementById('toggle-sidebar');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const offcanvas = new bootstrap.Offcanvas('#sidebarMobile');
      offcanvas.show();
    });
  }
}

async function loadView(viewName) {
  const viewModule = await import(`./views/${viewName}.js`);
  viewModule.default();
}

function setActiveSidebarItem(viewName) {
  document.querySelectorAll('[data-view]').forEach(link => {
    const isActive = link.getAttribute('data-view') === viewName;
    link.classList.toggle('active', isActive);
  });
}

document.addEventListener('DOMContentLoaded', loadSidebar);
