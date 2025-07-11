import { fetchDraftData } from '../api.js';
import { positions } from '../../components/constants.js';
import { showError, showLoadingBar } from '../../components/alerts.js';
import { renderExpertSelect } from '../../components/selectExperts.js';
import { renderLeagueSelect } from '../../components/selectLeagues.js';

export default async function renderDraftView() {
  const content = document.getElementById('content-container');
  content.innerHTML = `
    <div class="card border-0 shadow-sm rounded flock-card">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <h4 class="m-0 d-flex align-items-center gap-2">
            <i class="bi bi-clipboard-data text-info"></i> Draft
          </h4>
          <button class="btn btn-sm btn-primary" id="btn-update-draft">
            <i class="bi bi-arrow-clockwise"></i> Actualizar Draft
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

        <div class="table-responsive">
          <table id="draftTable" class="table table-dark table-hover align-middle w-100">
            <thead class="table-dark">
              <tr>
                <th>ADP</th>
                <th>Jugador</th>
                <th>Posición</th>
                <th>Equipo</th>
                <th>Bye</th>
                <th>Ranking</th>
                <th>Status</th>
                <th>Ronda</th>
                <th>Proyección</th>
                <th>VOR</th>
                <th>VOR Ajustado</th>
                <th>Dropoff</th>
                <th>Tier Global</th>
                <th>Tier Posición</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  const statusSelect = document.getElementById('select-status');
  const leagueSelect = document.getElementById('select-league');
  const positionSelect = document.getElementById('select-position');
  const expertSelect = document.getElementById('select-expert');
  const byeInput = document.getElementById('input-bye');

  const savedStatus = localStorage.getItem('draftStatusFilter');
  const savedLeague = localStorage.getItem('draftLeague');
  const savedPosition = localStorage.getItem('draftPosition');
  const savedExpert = localStorage.getItem('draftExpert');
  const savedBye = localStorage.getItem('draftBye');

  if (savedStatus) statusSelect.value = savedStatus;
  if (savedPosition) positionSelect.value = savedPosition;
  if (savedBye) byeInput.value = savedBye;

  await renderExpertSelect('#select-expert', {
    plugins: ['dropdown_input'],
    dropdownInput: false,
    create: false,
    persist: false,
		onChange() {
			this.blur();
		}
  });

  await renderLeagueSelect('#select-league', {
    plugins: ['dropdown_input'],
    dropdownInput: false,
    create: false,
    persist: false,
		onChange() {
			this.blur();
		}
  });

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

  document.getElementById('btn-update-draft').addEventListener('click', loadDraftData);

  let draftData = [];

  async function updateTable(data) {
    const statusFilter = statusSelect.value;
    const filteredData = data.filter(p => {
      const statusMatch = statusFilter === 'TODOS' || (p.status || '').toLowerCase().trim() === 'libre';
      return statusMatch;
    });

    const dataSet = filteredData.map(p => [
      p.adpValue ?? '',
      p.nombre,
      p.position,
      p.team,
      p.bye ?? '',
      p.rank ?? '',
      p.status,
      p.adpRound ?? '',
      `<span class="text-info fw-bold">${p.projection ?? ''}</span>`,
      p.vor ?? '',
      p.adjustedVOR ?? '',
      p.dropoff ?? '',
      `<span class="badge bg-danger text-light">${p.tier_global ?? ''} ${p.tier_global_label ?? ''}</span>`,
      `<span class="badge bg-primary text-light">${p.tier_pos ?? ''} ${p.tier_pos_label ?? ''}</span>`
    ]);

    if ($.fn.dataTable.isDataTable('#draftTable')) {
      const table = $('#draftTable').DataTable();
      table.clear();
      table.rows.add(dataSet);
      table.draw();
    } else {
      $('#draftTable').DataTable({
        data: dataSet,
        responsive: true,
        pageLength: 25,
        order: [[5, 'asc']],
        language: {
          url: '//cdn.datatables.net/plug-ins/2.3.2/i18n/es-MX.json'
        },
        dom: '<"row mb-2"<"col-sm-6"l><"col-sm-6"f>>tip',
        columnDefs: [
          { targets: [8, 12, 13], orderable: false },
          { targets: [8, 12, 13], className: 'text-nowrap text-center' }
        ],
        rowCallback: function (row, data) {
          const tier = $(data[12]).text().toLowerCase();
          $(row).removeClass('tier-elite tier-starter tier-bench');

          if (tier.includes('elite')) {
            $(row).addClass('tier-elite');
          } else if (tier.includes('starter')) {
            $(row).addClass('tier-starter');
          } else if (tier.includes('bench')) {
            $(row).addClass('tier-bench');
          }
        }
      });
    }
  }

  async function loadDraftData() {
    try {
      const leagueId = leagueSelect.value;
      const position = positionSelect.value;
      const byeCondition = byeInput.value || 0;
      const idExpert = expertSelect.value;

      if (!leagueId || !idExpert) {
        return showError('Selecciona una liga y un experto');
      }

      localStorage.setItem('draftLeague', leagueId);
      localStorage.setItem('draftPosition', position);
      localStorage.setItem('draftBye', byeCondition);
      localStorage.setItem('draftExpert', idExpert);

      showLoadingBar('Actualizando draft', 'Descargando datos más recientes...');

      const res = await fetchDraftData(leagueId, position, byeCondition, idExpert);
      draftData = res.data;
      updateTable(draftData);

      Swal.close();
    } catch (err) {
      Swal.close();
      showError('Error al actualizar draft: ' + err.message);
    }
  }

  if (savedLeague && savedPosition && savedExpert) {
    loadDraftData();
  }
}
