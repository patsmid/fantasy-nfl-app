async function loadSidebar() {
  const sidebar = document.getElementById('sidebar');
  const response = await fetch('/components/sidebar.html');
  sidebar.innerHTML = await response.text();

  document.querySelectorAll('[data-view]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const view = link.getAttribute('data-view');
      loadView(view);
    });
  });

  loadView('players');
}

async function loadView(viewName) {
  const viewModule = await import(`./views/${viewName}.js`);
  viewModule.default();
}

loadSidebar();
