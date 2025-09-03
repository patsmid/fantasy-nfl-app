import { fetchWaiversData } from '../api.js';
import { showError, showLoadingBar } from '../../components/alerts.js';
import { renderExpertSelect } from '../../components/selectExperts.js';
import { renderLeagueSelect } from '../../components/selectLeagues.js';

export default async function renderWaiversView() {
  const content = document.getElementById('content-container');
  content.innerHTML = `
    <div class="card border-0 shadow-sm rounded flock-card">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <h4 class="m-0 d-flex align-items-center gap-2">
            <i class="bi bi-people-fill text-success"></i> Waivers / Free Agents
          </h4>
          <button class="btn btn-sm btn-primary" id="btn-update-waivers">
            <i class="bi bi-arrow-clockwise"></i> Actualizar
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
          <h5 class="mb-3 text-flock"><i class="bi bi-stars"></i> Free Agents</h5>
          <div class="table-responsive">
            <table id="waiversTable" class="table table-dark table-hover align-middle w-100">
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

  await renderExpertSelect('#select-expert', {
    plugins: ['dropdown_input'],
    dropdownInput: false,
    create: false,
    persist: false,
    onChange() { this.blur(); }
  });

  await renderLeagueSelect('#select-league', {
    plugins: ['dropdown_input'],
    dropdownInput: false,
    create: false,
    persist: false,
    onChange() { this.blur(); }
  });

  const leagueSelect = document.getElementById('select-league');
  const expertSelect = document.getElementById('select-expert');
  const leagueTS = leagueSelect?.tomselect;
  const expertTS = expertSelect?.tomselect;

  const savedLeague = localStorage.getItem('waiversLeague');
  const savedExpert = localStorage.getItem('waiversExpert');

  if (leagueTS) {
    leagueTS.setValue(savedLeague || '');
    leagueTS.on('change', value => {
      localStorage.setItem('waiversLeague', value);
      loadWaiversData();
    });
  }

  if (expertTS) {
    expertTS.setValue(savedExpert || '');
    expertTS.on('change', value => {
      localStorage.setItem('waiversExpert', value);
      loadWaiversData();
    });
  }

  document.getElementById('btn-update-waivers').addEventListener('click', loadWaiversData);

  async function loadWaiversData() {
    const leagueId = leagueSelect.value;
    const selectedOption = expertSelect.selectedOptions[0];
    const expertValue = expertSelect.value;
    const idExpert = selectedOption?.dataset.id || '';

    if (!leagueId || !idExpert) {
      return showError('Selecciona una liga y un experto');
    }

    localStorage.setItem('waiversLeague', leagueId);
    localStorage.setItem('waiversExpert', expertValue);

    try {
      showLoadingBar('Cargando Waivers', 'Consultando información...');

      const { freeAgents, meta } = await fetchWaiversData(leagueId, idExpert);

      // Etiqueta de últimos rankings publicados
      const existingUpdateLabel = document.getElementById('last-updated-label');
      if (existingUpdateLabel) existingUpdateLabel.remove();

      if (meta?.published) {
        const updateLabel = document.createElement('div');
        updateLabel.id = 'last-updated-label';
        updateLabel.className = 'd-flex flex-wrap gap-3 mb-3';

        const [date, time] = meta.published.split(' ');
        const timeShort = time?.slice(0, 5) ?? '';

        updateLabel.innerHTML = `
          <div class="d-inline-flex align-items-center gap-2 px-3 py-1 small rounded-pill shadow-sm"
               style="background-color: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border);">
            <i class="bi bi-clock-history text-primary"></i>
            <span><strong>Ranks actualizados:</strong> ${date} ${timeShort}</span>
          </div>`;
        const cardBody = document.querySelector('.card-body');
        const form = cardBody.querySelector('form');
        cardBody.insertBefore(updateLabel, form.nextSibling);
      }

      const renderRows = players =>
        players.map(p => [
          p.rank ?? '',
          `<span class="fw-semibold">${p.nombre}</span>`,
          p.team ?? '',
          p.position ?? '',
          p.byeWeek ?? '',
          renderStatus(p.injuryStatus)
        ]);

      renderDataTable('#waiversTable', renderRows(freeAgents));

      Swal.close();
    } catch (err) {
      Swal.close();
      showError('Error al obtener waivers: ' + err.message);
    }
  }

  function renderStatus(status) {
    if (!status) return '<span class="text-success">OK</span>';
    return `<span class="text-warning fw-bold">${status}</span>`;
  }

  function renderDataTable(selector, data, striped = true) {
    const table = $(selector);
    table.DataTable().destroy();

    table.DataTable({
      data,
      columns: [
        { title: 'Rank' },
        { title: 'Jugador' },
        { title: 'Equipo' },
        { title: 'Posición' },
        { title: 'Bye' },
        { title: 'Estatus' }
      ],
      paging: false,
      searching: false,
      info: false,
      lengthChange: false,
      ordering: false,
      language: { emptyTable: 'Sin datos disponibles' },
      stripeClasses: striped ? ['table-striped'] : [],
      scrollCollapse: true,
      scrollY: false
    });
  }

  if (savedLeague && savedExpert) loadWaiversData();
}
