import { fetchLeagues, updateLeagues, updateLeaguesDynasty } from '../api.js';
import { showSuccess, showError } from '../../components/alerts.js';

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
    } catch (err) {
      showError('Error al actualizar ligas: ' + err.message);
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

  // Ordenar por display_order ASC
  leagues.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));

  const rows = leagues.map(l => {
    const dynastySwitch = `
      <div class="form-check form-switch mb-0">
        <input
          type="checkbox"
          class="form-check-input toggle-dynasty"
          data-id="${l.id}"
          ${l.dynasty ? 'checked' : ''}
          aria-label="Dynasty liga ${l.name}">
      </div>
    `;

    const bestBallBadge = l.bestball
      ? '<span class="badge bg-success">Sí</span>'
      : '<span class="badge bg-danger">No</span>';

    return [
      `<div class="text-white text-center">${l.id}</div>`,
      `<span class="fw-semibold">${l.name}</span>`,
      `<span class="fw-semibold">${l.league_id}</span>`,
      dynastySwitch,
      `<div class="text-center">${bestBallBadge}</div>`,
      `<div class="text-white text-center">${l.draft_id || ''}</div>`,
      `<div class="text-white text-center">${l.total_rosters || ''}</div>`,
      `<div class="text-center"><span class="badge bg-success text-uppercase">${l.status}</span></div>`
    ];
  });

  // Inicializa o reinicia DataTable
  if ($.fn.DataTable.isDataTable('#leaguesTable')) {
    const table = $('#leaguesTable').DataTable();
    table.clear().rows.add(rows).draw();
  } else {
		$('#leaguesTable').DataTable({
		  data: rows,
		  responsive: true,
		  paging: false,
		  language: {
		    url: '//cdn.datatables.net/plug-ins/2.3.2/i18n/es-MX.json'
		  },
		  dom: 'tip'
		});
  }

  // Volver a enlazar los listeners de interruptores dynasty
  setTimeout(() => {
    document.querySelectorAll('.toggle-dynasty').forEach(input => {
      input.addEventListener('change', async () => {
        const id = input.dataset.id;
        const dynasty = input.checked;
        try {
          await updateLeaguesDynasty(id, dynasty);
          showSuccess('Dynasty actualizado correctamente');
        } catch (err) {
          showError('Error al actualizar dynasty: ' + err.message);
        }
      });
    });
  }, 100);
}
