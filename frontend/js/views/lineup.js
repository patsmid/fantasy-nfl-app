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
          <h5 class="mb-3 text-flock"><i class="bi bi-stars"></i> Titulares</h5>
          <div class="table-responsive">
            <table id="startersTable" class="table table-dark table-hover align-middle w-100">
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
            <table id="benchTable" class="table table-dark table-hover align-middle w-100">
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

  const leagueSelect = document.getElementById('select-league');
  const expertSelect = document.getElementById('select-expert');
  const leagueTS = leagueSelect?.tomselect;
  const expertTS = expertSelect?.tomselect;

  // Restaurar valores del localStorage
  const savedLeague = localStorage.getItem('lineupLeague');
  const savedExpert = localStorage.getItem('lineupExpert');

  if (leagueTS) {
    leagueTS.setValue(savedLeague || '');
    leagueTS.on('change', value => {
      localStorage.setItem('lineupLeague', value);
      loadLineupData();
    });
  }

  if (expertTS) {
    expertTS.setValue(savedExpert || '');
    expertTS.on('change', value => {
      localStorage.setItem('lineupExpert', value);
      loadLineupData();
    });
  }

  document.getElementById('btn-update-lineup').addEventListener('click', loadLineupData);

  async function loadLineupData() {
    const leagueId = leagueSelect.value;
    const idExpert = expertSelect.value;

    if (!leagueId || !idExpert) {
      return showError('Selecciona una liga y un experto');
    }

    localStorage.setItem('lineupLeague', leagueId);
    localStorage.setItem('lineupExpert', idExpert);

    try {
      showLoadingBar('Generando alineación', 'Consultando información...');
      const { starters, bench, meta } = await fetchLineupData(leagueId, idExpert);

      // Eliminar etiqueta previa si existe
      const existingUpdateLabel = document.getElementById('last-updated-label');
      if (existingUpdateLabel) {
        existingUpdateLabel.remove();
      }

      if (meta?.published) {
        const updateLabel = document.createElement('div');
        updateLabel.id = 'last-updated-label';
        updateLabel.className = 'mb-3 update-label d-flex align-items-center gap-2';

        const [date, time] = meta.published.split(' ');
        const timeShort = time?.slice(0, 5) ?? '';

        updateLabel.innerHTML = `
          <i class="bi bi-clock-history text-primary"></i>
          Última actualización: ${date} ${timeShort}
        `;

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

      renderDataTable('#startersTable', renderRows(starters), false);
      renderDataTable('#benchTable', renderRows(bench), true);

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

  function renderDataTable(selector, data, striped = true) {
    const table = $(selector);
    table.DataTable().destroy(); // limpiar previo

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
      language: {
        emptyTable: 'Sin datos disponibles'
      },
      stripeClasses: striped ? ['table-striped'] : [],
      scrollCollapse: true,
      scrollY: false
    });
  }

  if (savedLeague && savedExpert) {
    loadLineupData();
  }
}
