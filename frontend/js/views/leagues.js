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
                <th style="width: 6rem;">ID</th>
                <th>Nombre</th>
                <th style="width: 8rem;">Dynasty</th>
                <th style="width: 8rem;">Draft ID</th>
                <th style="width: 7rem;">Rosters</th>
                <th style="width: 8rem;">Status</th>
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

  leagues.forEach(l => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="text-center text-white">${l.id}</td>
      <td class="fw-semibold">${l.name}</td>
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
      <td class="text-center text-white">${l.draft_id || ''}</td>
      <td class="text-center text-white">${l.total_rosters || ''}</td>
      <td class="text-center text-capitalize text-secondary"><span class="badge bg-success text-uppercase">${l.status}</span></td>
    `;
    tbody.appendChild(tr);
  });

  // Listener de dynasty
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

  // DataTable con idioma español
  window.leaguesTable = new DataTable('#leaguesTable', {
    destroy: true,
    responsive: true,
    perPage: 10,
    sortable: true,
    labels: {
      placeholder: 'Buscar ligas...',
      perPage: '{select} por página',
      noRows: 'No se encontraron ligas',
      info: 'Mostrando {start} a {end} de {rows} ligas',
    }
  });
}
