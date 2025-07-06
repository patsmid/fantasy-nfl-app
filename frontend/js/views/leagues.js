import { fetchLeagues, updateLeagues, updateLeaguesDynasty } from '../api.js';

export default async function () {
  const content = document.getElementById('content-container');
  content.innerHTML = `
    <div class="container mt-4">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <h2 class="fw-semibold mb-0">Ligas</h2>
        <button class="btn btn-primary d-flex align-items-center gap-2" id="btn-update-leagues" type="button" aria-label="Actualizar ligas">
          <i class="bi bi-arrow-clockwise fs-5"></i>
          Actualizar
        </button>
      </div>
      <div class="table-responsive shadow-sm rounded">
        <table id="leaguesTable" class="table table-bordered table-hover align-middle mb-0 w-100">
          <thead class="table-light text-uppercase text-secondary">
            <tr>
              <th scope="col" style="width: 6rem;">ID</th>
              <th scope="col">Nombre</th>
              <th scope="col" style="width: 8rem;">Dynasty</th>
              <th scope="col" style="width: 8rem;">Draft ID</th>
              <th scope="col" style="width: 7rem;">Rosters</th>
              <th scope="col" style="width: 8rem;">Status</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('btn-update-leagues').addEventListener('click', async () => {
    try {
      document.getElementById('btn-update-leagues').disabled = true;
      await updateLeagues();
      await loadLeagues();
    } finally {
      document.getElementById('btn-update-leagues').disabled = false;
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
      <td class="text-center">${l.id}</td>
      <td>${l.name}</td>
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
      <td class="text-center">${l.draft_id || ''}</td>
      <td class="text-center">${l.total_rosters || ''}</td>
      <td class="text-center text-capitalize">${l.status || ''}</td>
    `;
    tbody.appendChild(tr);
  });

  // Listeners de dynasty
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

  // Inicializa DataTable con idioma español y opciones modernas
  window.leaguesTable = new DataTable('#leaguesTable', {
    destroy: true,
    responsive: true,
    perPage: 10,
    sortable: true,
    labels: {
      placeholder: 'Buscar ligas...',
      perPage: '{select} registros por página',
      noRows: 'No se encontraron ligas',
      info: 'Mostrando {start} a {end} de {rows} ligas',
    },
    language: {
      searchPlaceholder: "Buscar ligas...",
      info: "Mostrando _START_ a _END_ de _TOTAL_ ligas",
      lengthMenu: "Mostrar _MENU_ ligas",
      infoEmpty: "Mostrando 0 a 0 de 0 ligas",
      zeroRecords: "No se encontraron ligas",
      paginate: {
        first: "Primero",
        last: "Último",
        next: "Siguiente",
        previous: "Anterior"
      },
    }
  });
}
