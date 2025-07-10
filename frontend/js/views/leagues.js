import { fetchLeagues, updateLeagues, updateLeaguesDynasty } from '../api.js';

export default async function () {
  const content = document.getElementById('content-container');
  content.innerHTML = `
    <div class="card border-0 shadow-sm rounded flock-card">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <h4 class="m-0 d-flex align-items-center gap-2">
            <i class="bi bi-trophy-fill text-danger"></i> Ligas
          </h4>
          <button class="btn btn-sm btn-primary d-flex align-items-center gap-2" id="btn-update-leagues" type="button">
            <i class="bi bi-arrow-clockwise"></i> Actualizar
          </button>
        </div>

        <div class="table-responsive">
          <table id="leaguesTable" class="table table-dark table-hover align-middle w-100">
            <thead class="table-dark text-uppercase text-secondary small">
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>League ID</th>
                <th>Dynasty</th>
                <th>BestBall</th>
                <th>Draft ID</th>
                <th>Rosters</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  const btn = document.getElementById('btn-update-leagues');
  btn.addEventListener('click', async () => {
    try {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Actualizando...`;
      await updateLeagues();
      await loadLeagues();
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<i class="bi bi-arrow-clockwise"></i> Actualizar`;
    }
  });

  await loadLeagues();
}

async function loadLeagues() {
  const leagues = await fetchLeagues();
  const tbody = document.querySelector('#leaguesTable tbody');
  tbody.innerHTML = '';

  // Ordenar por display_order ASC
  leagues.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));

  leagues.forEach(l => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="text-center text-white">${l.id}</td>
      <td class="fw-semibold">${l.name}</td>
      <td class="fw-semibold">${l.league_id}</td>
      <td class="text-center">
        <div class="form-check form-switch mb-0">
          <input
            type="checkbox"
            class="form-check-input toggle-dynasty"
            data-id="${l.id}"
            ${l.dynasty ? 'checked' : ''}
            aria-label="Dynasty liga ${l.name}"
          >
        </div>
      </td>
      <td class="text-center">
        <span class="badge ${l.bestball ? 'bg-success' : 'bg-danger'}">
          ${l.bestball ? 'Sí' : 'No'}
        </span>
      </td>
      <td class="text-center text-white">${l.draft_id || ''}</td>
      <td class="text-center text-white">${l.total_rosters || ''}</td>
      <td class="text-center text-capitalize">
        <span class="badge bg-success text-uppercase">${l.status}</span>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Listener de interruptores dynasty
  document.querySelectorAll('.toggle-dynasty').forEach(input => {
    input.addEventListener('change', async () => {
      const id = input.dataset.id;
      const dynasty = input.checked;
      try {
        await updateLeaguesDynasty(id, dynasty);
      } catch (err) {
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'Error al actualizar dynasty: ' + err.message,
        });
      }
    });
  });

  // Destruir DataTable si ya existe
  if ($.fn.DataTable.isDataTable('#leaguesTable')) {
    $('#leaguesTable').DataTable().clear().destroy();
  }

  // Inicializar DataTable nuevamente
  $('#leaguesTable').DataTable({
    responsive: true,
    pageLength: 30,
    language: {
      url: '//cdn.datatables.net/plug-ins/2.3.2/i18n/es-MX.json'
    },
    dom: 'tip'
  });
}
