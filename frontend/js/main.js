async function loadSidebar() {
  const sidebar = document.getElementById('sidebar');
  const response = await fetch('/components/sidebar.html');
  sidebar.innerHTML = await response.text();

  // Activar links de vista
  document.querySelectorAll('[data-view]').forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const view = link.getAttribute('data-view');
      await loadView(view);

      // Si estamos en móvil, ocultamos la sidebar al hacer clic en un enlace
      if (window.innerWidth < 992) {
        sidebar.classList.remove('show');
      }
    });
  });

  // Activar botón ☰ para mostrar u ocultar sidebar (mobile)
  const toggleBtn = document.getElementById('toggle-sidebar');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('show');
    });
  }

  // Carga inicial
  loadView('players');
}

async function loadView(viewName) {
  const viewModule = await import(`./views/${viewName}.js`);
  viewModule.default();
}

document.addEventListener('DOMContentLoaded', loadSidebar);
