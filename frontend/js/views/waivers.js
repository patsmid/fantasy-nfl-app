// frontend/src/views/waivers.js
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

        <!-- Controles de vista, filtros y buscador -->
        <div class="row g-3 mb-4 align-items-end">
          <div class="col-md-3">
            <select id="filter-position" class="form-select">
              <option value="">Todas las posiciones</option>
              <option value="QB">QB</option>
              <option value="RB">RB</option>
              <option value="WR">WR</option>
              <option value="TE">TE</option>
              <option value="K">K</option>
              <option value="DEF">DST</option>
            </select>
          </div>
          <div class="col-md-3">
            <select id="filter-team" class="form-select">
              <option value="">Todos los equipos</option>
            </select>
          </div>
          <div class="col-md-3">
            <input id="search-player" type="text" class="form-control" placeholder="Buscar jugador...">
          </div>
          <div class="col-md-3 text-end">
            <div class="btn-group" role="group">
              <button class="btn btn-outline-secondary active" id="toggle-cards">Cards</button>
              <button class="btn btn-outline-secondary" id="toggle-table">Tabla</button>
            </div>
          </div>
        </div>

        <!-- Contenedor de tarjetas -->
        <div id="waiversCards" class="row g-3"></div>

        <!-- Contenedor de tabla -->
        <div id="waiversTableContainer" class="table-responsive d-none">
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

        <!-- Paginación (solo para cards) -->
        <div id="pagination-controls" class="d-flex justify-content-between align-items-center mt-4">
          <button class="btn btn-outline-secondary btn-sm" id="prev-page">Anterior</button>
          <span id="pagination-info" class="small text-muted"></span>
          <button class="btn btn-outline-secondary btn-sm" id="next-page">Siguiente</button>
        </div>
      </div>
    </div>
  `;

  await renderExpertSelect('#select-expert', { onChange() { this.blur(); } });
  await renderLeagueSelect('#select-league', { onChange() { this.blur(); } });

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

  // Estado global
  let currentPage = 1;
  const pageSize = 12;
  let allPlayers = [];
  let viewMode = "cards"; // "cards" o "table"

  async function loadWaiversData() {
    const leagueId = leagueSelect.value;
    const selectedOption = expertSelect.selectedOptions[0];
    const expertValue = expertSelect.value;
    const idExpert = selectedOption?.dataset.id || '';

    if (!leagueId || !idExpert) return showError('Selecciona una liga y un experto');

    localStorage.setItem('waiversLeague', leagueId);
    localStorage.setItem('waiversExpert', expertValue);

    try {
      showLoadingBar('Cargando Waivers', 'Consultando información...');
      const { freeAgents, meta } = await fetchWaiversData(leagueId, idExpert);

      allPlayers = freeAgents || [];
      renderFilters(allPlayers);
      render();

      Swal.close();
    } catch (err) {
      Swal.close();
      showError('Error al obtener waivers: ' + err.message);
    }
  }

  function renderFilters(players) {
    const teams = [...new Set(players.map(p => p.team).filter(Boolean))].sort();
    const teamSelect = document.getElementById('filter-team');
    teamSelect.innerHTML = `<option value="">Todos los equipos</option>` +
      teams.map(t => `<option value="${t}">${t}</option>`).join('');
  }

  function getFilteredPlayers() {
    const posFilter = document.getElementById('filter-position').value;
    const teamFilter = document.getElementById('filter-team').value;
    const search = document.getElementById('search-player').value.toLowerCase();

    return allPlayers
      .filter(p => !posFilter || p.position === posFilter)
      .filter(p => !teamFilter || p.team === teamFilter)
      .filter(p => !search || p.nombre.toLowerCase().includes(search));
  }

  function render() {
    const filtered = getFilteredPlayers();

    if (viewMode === "cards") {
      renderCards(filtered);
      document.getElementById("waiversCards").classList.remove("d-none");
      document.getElementById("waiversTableContainer").classList.add("d-none");
      document.getElementById("pagination-controls").classList.remove("d-none");
    } else {
      renderTable(filtered);
      document.getElementById("waiversCards").classList.add("d-none");
      document.getElementById("waiversTableContainer").classList.remove("d-none");
      document.getElementById("pagination-controls").classList.add("d-none");
    }
  }

	function getPositionColor(position) {
	  switch ((position || '').toUpperCase()) {
	    case 'QB': return '#ff2a6d';   // Rosa fuerte
	    case 'RB': return '#00ceb8';   // Verde aqua
	    case 'WR': return '#58a7ff';   // Azul celeste
	    case 'TE': return '#ffae58';   // Naranja
			default:   return '#6c757d';   // Gris neutro
	  }
	}

	function renderCard(p) {
	  const color = getPositionColor(p.position);
	  return `
	    <div class="col-12 col-md-6 col-lg-4">
	      <div class="card shadow-sm border-0 h-100">
	        <div class="card-body d-flex flex-column">
	          <h6 class="card-title mb-1 fw-bold">
	            <span class="badge me-2"
	                  style="background-color:${color}; color:#fff;">
	              ${p.position || ''}
	            </span>
	            ${p.nombre}
	          </h6>
	          <small class="text-muted mb-2">${p.team || ''} • Bye ${p.byeWeek || '-'}</small>
	          <div class="mt-auto d-flex justify-content-between align-items-center">
	            <span class="badge bg-dark">Rank ${p.rank ?? '-'}</span>
	            ${renderStatus(p.injuryStatus)}
	          </div>
	        </div>
	      </div>
	    </div>`;
	}

  function renderTable(players) {
    const table = $('#waiversTable');
    table.DataTable().destroy();
    table.DataTable({
      data: players.map(p => [
        p.rank ?? '',
        `<span class="fw-semibold">${p.nombre}</span>`,
        p.team ?? '',
        p.position ?? '',
        p.byeWeek ?? '',
        renderStatus(p.injuryStatus)
      ]),
      columns: [
        { title: 'Rank' },
        { title: 'Jugador' },
        { title: 'Equipo' },
        { title: 'Posición' },
        { title: 'Bye' },
        { title: 'Estatus' }
      ],
      paging: true,
      searching: false,
      info: false,
      ordering: true,
      pageLength: 15,
      language: { emptyTable: 'Sin datos disponibles' }
    });
  }

  function renderCard(p) {
    const posColors = { QB: 'primary', RB: 'success', WR: 'warning', TE: 'info', K: 'secondary', DST: 'dark' };
    const color = posColors[p.position] || 'light';
    return `
      <div class="col-12 col-md-6 col-lg-4">
        <div class="card shadow-sm border-0 h-100">
          <div class="card-body d-flex flex-column">
            <h6 class="card-title mb-1 fw-bold">
              <span class="badge bg-${color} me-2">${p.position}</span> ${p.nombre}
            </h6>
            <small class="text-muted mb-2">${p.team || ''} • Bye ${p.byeWeek || '-'}</small>
            <div class="mt-auto d-flex justify-content-between align-items-center">
              <span class="badge bg-dark">Rank ${p.rank ?? '-'}</span>
              ${renderStatus(p.injuryStatus)}
            </div>
          </div>
        </div>
      </div>`;
  }

  function renderStatus(status) {
    if (!status) return '<span class="badge bg-success">Healthy</span>';
    return `<span class="badge bg-warning text-dark">${status}</span>`;
  }

  // Eventos
  document.getElementById('filter-position').addEventListener('change', () => { currentPage = 1; render(); });
  document.getElementById('filter-team').addEventListener('change', () => { currentPage = 1; render(); });
  document.getElementById('search-player').addEventListener('input', () => { currentPage = 1; render(); });
  document.getElementById('prev-page').addEventListener('click', () => { currentPage--; render(); });
  document.getElementById('next-page').addEventListener('click', () => { currentPage++; render(); });

  document.getElementById('toggle-cards').addEventListener('click', (e) => {
    e.preventDefault();
    viewMode = "cards";
    document.getElementById('toggle-cards').classList.add("active");
    document.getElementById('toggle-table').classList.remove("active");
    render();
  });

  document.getElementById('toggle-table').addEventListener('click', (e) => {
    e.preventDefault();
    viewMode = "table";
    document.getElementById('toggle-table').classList.add("active");
    document.getElementById('toggle-cards').classList.remove("active");
    render();
  });

  if (savedLeague && savedExpert) loadWaiversData();
}
