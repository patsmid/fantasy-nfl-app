import { fetchLeagues, updateLeagues, updateLeaguesDynasty } from '../api.js';

export default async function () {
  const content = document.getElementById('content-container');
  content.innerHTML = `
    <div class="container mt-4">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h2>Ligas</h2>
        <button class="btn btn-primary" id="btn-update-leagues">
          <i class="fas fa-sync-alt"></i> Actualizar
        </button>
      </div>
      <table id="leaguesTable" class="table table-bordered table-hover w-100">
        <thead class="table-light">
          <tr>
            <th>ID</th>
            <th>Nombre</th>
            <th>Dynasty</th>
            <th>Draft ID</th>
            <th>Rosters</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
  `;

  document.getElementById('btn-update-leagues').addEventListener('click', async () => {
    await updateLeagues();
    await loadLeagues(); // recarga la tabla con DataTables
  });

  await loadLeagues(); // inicial al entrar
}

async function loadLeagues() {
  const leagues = await fetchLeagues();

  // Destruir instancia anterior si ya existe
  if (window.leaguesTable) {
    window.leaguesTable.destroy();
  }

  const tbody = document.querySelector('#leaguesTable tbody');
  tbody.innerHTML = '';

  leagues.forEach(l => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${l.id}</td>
      <td>${l.name}</td>
      <td>
        <div class="form-check form-switch mb-0">
          <input type="checkbox" class="form-check-input toggle-dynasty" data-id="${l.id}" ${l.dynasty ? 'checked' : ''}>
        </div>
      </td>
      <td>${l.draft_id || ''}</td>
      <td>${l.total_rosters || ''}</td>
      <td>${l.status || ''}</td>
    `;
    tbody.appendChild(tr);
  });

  // Activar toggle dynasty listeners
  document.querySelectorAll('.toggle-dynasty').forEach(input => {
    input.addEventListener('change', async () => {
      const id = input.dataset.id;
      const dynasty = input.checked;
      try {
        await updateLeaguesDynasty(id, dynasty);
      } catch (err) {
        alert('Error al actualizar dynasty: ' + err.message);
      }
    });
  });

  // Inicializar DataTable sin jQuery
  window.leaguesTable = new DataTable('#leaguesTable', {
    responsive: true,
    perPage: 10,
    labels: {
      placeholder: 'Buscar...',
      perPage: '{select} registr
