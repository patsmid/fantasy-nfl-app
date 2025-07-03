async function loadSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.innerHTML = await (await fetch('/components/sidebar.html')).text();
  $('.nav-sidebar').on('click','a[data-view]', function(e) {
    e.preventDefault();
    $('.nav-link').removeClass('active');
    $(this).addClass('active');
    const view = this.dataset.view;
    loadView(view);
  });
  loadView('players');
}

async function loadView(view) {
  const module = await import(`./views/${view}.js`);
  module.default();
}

$(function() {
  loadSidebar();
});
