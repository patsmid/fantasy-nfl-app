// lineup.js
import { fetchLineupData } from '../api.js';
import { showError, showLoadingBar } from '../../components/alerts.js';
import { renderExpertSelect } from '../../components/selectExperts.js';
import { renderLeagueSelect } from '../../components/selectLeagues.js';

export default async function renderLineupView() {
  const content = document.getElementById('content-container');
  content.innerHTML = `
    <div class="card border-0 shadow-sm rounded flock-card">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <h4 class="m-0 d-flex align-items-center gap-2">
            <i class="bi bi-people-fill text-success"></i> Alineación óptima
          </h4>
          <button class="btn btn-sm btn-primary" id="btn-update-lineup">
            <i class="bi bi-arrow-clockwise"></i> Calcular alineación
          </button>
        </div>

        <form class="row g-3 mb-4">
          <div class="col-md-4">
            <label for="select-league" class="form-label">Liga</label>
            <select id="select-league" class="form-select"></select>
          </div>
          <div class="col-md-4">
            <label for="select-expert" class="form-label">Experto</label>
            <select id="select-expert" class="form-select"></select>
          </div>
        </form>

        <div class="mb-4">
          <h5 class="text-primary mb-2"><i class="bi bi-stars"></i> Titulares</h5>
          <div class="table-responsive">
            <table id="startersTable" class="table table-hover align-middle w-100">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Jugador</th>
                  <th>Equipo</th>
                  <th>Posición</th>
                  <th>Bye</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>

        <div>
          <h5 class="text-secondary mb-2"><i class="bi bi-person-dash"></i> Bench</h5>
          <div class="table-responsive">
            <table id="benchTable" class="table table-hover align-middle w-100">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Jugador</th>
                  <th>Equipo</th>
                  <th>Posición</th>
                  <th>Bye</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;

  await renderExpertSelect('#select-expert');
  await renderLeagueSelect('#select-league');

  document.getElementById('btn-update-lineup').addEventListener('click', loadLineupData);

  async function loadLineupData() {
    const leagueId = document.getElementById('select-league').value;
    const idExpert = document.getElementById('select-expert').value;

    if (!leagueId || !idExpert) {
      return showError('Selecciona una liga y un experto');
    }

    try {
      showLoadingBar('Generando alineación', 'Consultando información...');

      const { starters, bench } = await fetchLineupData(leagueId, idExpert).then(r => r.data);

      const renderRows = players => players.map(p => `
        <tr>
          <td>${p.rank}</td>
          <td class="fw-semibold">${p.nombre}</td>
          <td>${p.team}</td>
          <td>${p.position}</td>
          <td>${p.byeWeek}</td>
          <td>${renderStatus(p.injuryStatus)}</td>
        </tr>
      `).join('');

      document.querySelector('#startersTable tbody').innerHTML = renderRows(starters);
      document.querySelector('#benchTable tbody').innerHTML = renderRows(bench);

      Swal.close();
    } catch (err) {
      Swal.close();
      showError('Error al obtener alineación: ' + err.message);
    }
  }

  function renderStatus(status) {
    if (!status) return '<span class="text-success">OK</span>';
    return `<span class="text-warning fw-bold">${status}</span>`;
  }
}
