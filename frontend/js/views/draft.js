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
        <div class="col-md-2">
          <label class="form-label d-block">Etiquetas</label>
          <div class="form-check form-check-inline">
            <input class="form-check-input" type="checkbox" id="filter-rookie">
            <label class="form-check-label" for="filter-rookie">Rookie</label>
          </div>
          <div class="form-check form-check-inline">
            <input class="form-check-input" type="checkbox" id="filter-valor">
            <label class="form-check-label" for="filter-valor">Valor</label>
          </div>
          <div class="form-check form-check-inline">
            <input class="form-check-input" type="checkbox" id="filter-riesgo">
            <label class="form-check-label" for="filter-riesgo">Riesgo</label>
          </div>
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

  const statusSelect = document.getElementById('select-status');
  const leagueSelect = document.getElementById('select-league');
  const positionSelect = document.getElementById('select-position');
  const expertSelect = document.getElementById('select-expert');
  const byeInput = document.getElementById('input-bye');
  const rookieCheckbox = document.getElementById('filter-rookie');
  const valorCheckbox = document.getElementById('filter-valor');
  const riesgoCheckbox = document.getElementById('filter-riesgo');

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

  const expertTS = document.querySelector('#select-expert')?.tomselect;
  if (expertTS) {
    expertTS.setValue(savedExpert || '');
    expertTS.on('change', value => {
      localStorage.setItem('draftExpert', value);
      loadDraftData();
    });
  }

  const leagueTS = document.querySelector('#select-league')?.tomselect;
  if (leagueTS) {
    leagueTS.setValue(savedLeague || '');
    leagueTS.on('change', value => {
      localStorage.setItem('draftLeague', value);
      loadDraftData();
    });
  }

  positionSelect.addEventListener('change', () => {
    localStorage.setItem('draftPosition', positionSelect.value);
    loadDraftData();
  });

  statusSelect.addEventListener('change', () => {
    localStorage.setItem('draftStatusFilter', statusSelect.value);
    if (draftData.length) updateTable(draftData);
  });

  rookieCheckbox.addEventListener('change', () => draftData.length && updateTable(draftData));
  valorCheckbox.addEventListener('change', () => draftData.length && updateTable(draftData));
  riesgoCheckbox.addEventListener('change', () => draftData.length && updateTable(draftData));

  document.getElementById('btn-update-draft').addEventListener('click', loadDraftData);

  let draftData = [];
  let draftTableInstance;

  async function updateTable(data) {
    const tbody = document.querySelector('#draftTable tbody');
    tbody.innerHTML = '';

    const statusFilter = statusSelect.value;
    const showRookies = rookieCheckbox.checked;
    const showValor = valorCheckbox.checked;
    const showRiesgo = riesgoCheckbox.checked;

    const filteredData = data.filter(p => {
      const statusMatch = statusFilter === 'TODOS' || (p.status || '').toLowerCase().trim() === 'libre';
      const rookieMatch = !showRookies || p.rookie === true;
      const valorMatch = !showValor || (p.etiquetas || []).includes('valor');
      const riesgoMatch = !showRiesgo || (p.etiquetas || []).includes('riesgo');
      return statusMatch && rookieMatch && valorMatch && riesgoMatch;
    });

    filteredData.forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${p.adpValue ?? ''}</td>
        <td>${p.nombre}</td>
        <td>${p.position}</td>
        <td>${p.team}</td>
        <td>${p.bye ?? ''}</td>
        <td>${p.rank ?? ''}</td>
        <td>${p.status}</td>
        <td>${p.adpRound ?? ''}</td>
        <td>${p.adpDiff ?? ''}</td>
      `;
      tbody.appendChild(tr);
    });

    if (draftTableInstance) {
      draftTableInstance.destroy();
    }

    draftTableInstance = new DataTable('#draftTable', {
      responsive: true,
      pageLength: 25,
      order: [[5, 'asc']],
      language: {
        url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json'
      }
    });
  }

  async function loadDraftData() {
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
  }

  if (savedLeague && savedPosition && savedExpert) {
    loadDraftData();
  }
}
