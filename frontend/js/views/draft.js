import { fetchDraftData } from '../api.js';
import { positions } from '../../components/constants.js';
import { showError } from '../../components/alerts.js';
import { renderExpertSelect } from '../../components/selectExperts.js';
import { renderLeagueSelect } from '../../components/selectLeagues.js';

export default async function renderDraftView() {
  const content = document.getElementById('content-container');
  content.innerHTML = `
    <div class="container mt-4">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h2>Draft</h2>
        <button class="btn btn-primary" id="btn-update-draft">
          <i class="fas fa-sync"></i> Actualizar Draft
        </button>
      </div>

      <form class="row g-3 mb-4">
        <div class="col-md-3">
          <label for="select-league" class="form-label">Liga</label>
          <select id="select-league" class="form-select"></select>
        </div>
        <div class="col-md-2">
          <label for="select-position" class="form-label">Posición</label>
          <select id="select-position" class="form-select">
            ${positions.map(p => `<option value="${p.nombre}">${p.nombre}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-2">
          <label for="input-bye" class="form-label">Bye condición</label>
          <input type="number" class="form-control" id="input-bye" placeholder="0">
        </div>
        <div class="col-md-3">
          <label for="select-expert" class="form-label">Experto</label>
          <select id="select-expert" class="form-select"></select>
        </div>
        <div class="col-md-2">
          <label for="select-status" class="form-label">Status</label>
          <select id="select-status" class="form-select">
            <option value="LIBRE">LIBRE</option>
            <option value="TODOS">TODOS</option>
          </select>
        </div>
      </form>

      <table id="draftTable" class="table table-bordered table-hover w-100">
        <thead class="table-light">
          <tr>
            <th>ADP</th>
            <th>Jugador</th>
            <th>Posición</th>
            <th>Equipo</th>
            <th>Bye</th>
            <th>Ranking</th>
            <th>Status</th>
            <th>Ronda</th>
            <th>Diferencia</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
  `;

  // Referencias
  const statusSelect = document.getElementById('select-status');
  const leagueSelect = document.getElementById('select-league');
  const positionSelect = document.getElementById('select-position');
  const expertSelect = document.getElementById('select-expert');
  const byeInput = document.getElementById('input-bye');

  // Cargar desde localStorage
  const savedStatus = localStorage.getItem('draftStatusFilter');
  const savedLeague = localStorage.getItem('draftLeague');
  const savedPosition = localStorage.getItem('draftPosition');
  const savedExpert = localStorage.getItem('draftExpert');
  const savedBye = localStorage.getItem('draftBye');

  if (savedStatus) statusSelect.value = savedStatus;
  if (savedPosition) positionSelect.value = savedPosition;
  if (savedBye) byeInput.value = savedBye;

  await renderExpertSelect('#select-expert');
  await renderLeagueSelect('#select-league');

  if (savedExpert) {
    const ts = document.querySelector('#select-expert')?.tomselect;
    ts?.setValue(savedExpert);
  }
  if (savedLeague) {
    const ts = document.querySelector('#select-league')?.tomselect;
    ts?.setValue(savedLeague);
  }

  // Agregar listeners para guardar cambios automáticamente
  const expertSelectTS = document.querySelector('#select-expert')?.tomselect;
  expertSelectTS?.on('change', (value) => {
    localStorage.setItem('draftExpert', value);
  });

  const leagueSelectTS = document.querySelector('#select-league')?.tomselect;
  leagueSelectTS?.on('change', (value) => {
    localStorage.setItem('draftLeague', value);
  });

  let draftData = [];

  async function updateTable(data) {
    const tbody = document.querySelector('#draftTable tbody');
    tbody.innerHTML = '';

    const statusFilter = statusSelect.value;
    const filteredData = statusFilter === 'TODOS'
      ? data
      : data.filter(p => (p.status || '').toLowerCase().trim() === 'libre');

    filteredData.forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${p.adpValue}</td>
        <td>${p.nombre}</td>
        <td>${p.position}</td>
        <td>${p.team}</td>
        <td>${p.bye}</td>
        <td>${p.rank}</td>
        <td>${p.status}</td>
        <td>${p.adpRound}</td>
        <td>${p.adpDiff}</td>
      `;
      tbody.appendChild(tr);
    });

    window.draftTable = new DataTable('#draftTable', {
      destroy: true,
      responsive: true,
      perPage: 25,
      order: [[5, 'asc']], // Ranking
      language: {
        url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json'
      }
    });
  }

  document.getElementById('btn-update-draft').addEventListener('click', async () => {
    try {
      const leagueId = leagueSelect.value;
      const position = positionSelect.value;
      const byeCondition = byeInput.value || 0;
      const idExpert = expertSelect.value || 3701;

      if (!leagueId) return showError('Selecciona una liga');

      localStorage.setItem('draftLeague', leagueId);
      localStorage.setItem('draftPosition', position);
      localStorage.setItem('draftBye', byeCondition);
      localStorage.setItem('draftExpert', idExpert);

      const res = await fetchDraftData(leagueId, position, byeCondition, idExpert);
      draftData = res.data;

      updateTable(draftData);
    } catch (err) {
      showError('Error al actualizar draft: ' + err.message);
    }
  });

  // Cambio en filtro de status con persistencia
  statusSelect.addEventListener('change', () => {
    localStorage.setItem('draftStatusFilter', statusSelect.value);
    if (draftData.length > 0) {
      updateTable(draftData);
    }
  });
}
