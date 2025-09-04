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
          <div class="col-md-4">
            <label for="input-week" class="form-label">Semana</label>
            <input id="input-week" type="text" class="form-control" placeholder="Ej. 3">
          </div>
        </form>

        <!-- Controles de vista, filtros, buscador y orden -->
        <div class="row g-3 mb-4 align-items-end">
          <div class="col-md-3">
            <select id="filter-position" class="form-select">
              <option value="">Todas las posiciones</option>
              <option value="QB">QB</option>
              <option value="RB">RB</option>
              <option value="WR">WR</option>
              <option value="TE">TE</option>
              <option value="K">K</option>
              <option value="DEF">DEF</option>
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
            <div class="d-flex justify-content-end align-items-start gap-2">
              <div>
                <div class="btn-group me-2" role="group">
                  <button class="btn btn-outline-secondary active" id="toggle-cards">Cards</button>
                  <button class="btn btn-outline-secondary" id="toggle-table">Tabla</button>
                </div>
              </div>
            </div>
            <div class="mt-2">
              <select id="sort-mode" class="form-select form-select-sm">
                <option value="rank-asc">Orden: Rank ↑</option>
                <option value="rank-desc">Orden: Rank ↓</option>
                <option value="winner-desc">Orden: LeagueWinnerScore ↓</option>
                <option value="tier">Orden: Tier (A → D)</option>
                <option value="breakout-desc">Orden: BreakoutIndex ↓</option>
              </select>
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
                <th>Tier</th>
                <th>Winner</th>
                <th>Breakout</th>
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
  const inputWeek   = document.getElementById('input-week');
  const sortSelect  = document.getElementById('sort-mode');
  const leagueTS = leagueSelect?.tomselect;
  const expertTS = expertSelect?.tomselect;

  const savedLeague = localStorage.getItem('waiversLeague');
  const savedExpert = localStorage.getItem('waiversExpert');
  let currentPage = 1;
  const pageSize = 12;
  let allPlayers = [];
  let viewMode = "cards";
  let sortMode = sortSelect.value || 'rank-asc';

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
  sortSelect.addEventListener('change', (e) => { sortMode = e.target.value; currentPage = 1; render(); });

  async function loadWaiversData() {
    const leagueId = leagueSelect.value;
    const selectedOption = expertSelect.selectedOptions[0];
    const expertValue = expertSelect.value;
    const idExpert = selectedOption?.dataset.id || '';
    const week = inputWeek.value || '';

    if (!leagueId || !idExpert) return showError('Selecciona una liga y un experto');

    localStorage.setItem('waiversLeague', leagueId);
    localStorage.setItem('waiversExpert', expertValue);

    try {
      showLoadingBar('Cargando Waivers', 'Consultando información...');
      const { freeAgents, meta } = await fetchWaiversData(leagueId, idExpert, week);

      allPlayers = freeAgents || [];
      renderFilters(allPlayers);
      currentPage = 1;
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
      .filter(p => !search || (p.nombre || '').toLowerCase().includes(search));
  }

  function tierToOrder(t) {
    if (!t) return 99;
    const map = { 'A': 0, 'B': 1, 'C': 2, 'D': 3 };
    return map[String(t).toUpperCase()] ?? 99;
  }

  function applySorting(arr) {
    const copy = [...arr];
    switch (sortMode) {
      case 'rank-asc':
        return copy.sort((a, b) => (a.rank ?? 99999) - (b.rank ?? 99999));
      case 'rank-desc':
        return copy.sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0));
      case 'winner-desc':
        return copy.sort((a, b) => (b.leagueWinnerScore ?? 0) - (a.leagueWinnerScore ?? 0) || (a.rank ?? 99999) - (b.rank ?? 99999));
      case 'tier':
        return copy.sort((a, b) => tierToOrder(a.tier) - tierToOrder(b.tier) || (a.rank ?? 99999) - (b.rank ?? 99999));
      case 'breakout-desc':
        return copy.sort((a, b) => (b.breakoutIndex ?? 0) - (a.breakoutIndex ?? 0) || (a.rank ?? 99999) - (b.rank ?? 99999));
      default:
        return copy.sort((a, b) => (a.rank ?? 99999) - (b.rank ?? 99999));
    }
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

  function renderCards(players) {
    // Aplica orden global según selección
    const ordered = applySorting(players);

    const totalPages = Math.ceil(ordered.length / pageSize);
    if (currentPage > totalPages) currentPage = totalPages || 1;
    const start = (currentPage - 1) * pageSize;
    const pageData = ordered.slice(start, start + pageSize);

    const container = document.getElementById('waiversCards');
    container.innerHTML = pageData.map(p => renderCard(p)).join('');

    document.getElementById('pagination-info').textContent =
      `Página ${currentPage} de ${totalPages || 1}`;
    document.getElementById('prev-page').disabled = currentPage <= 1;
    document.getElementById('next-page').disabled = currentPage >= totalPages;
  }

  function renderTable(players) {
    // Aplica orden global
    const ordered = applySorting(players);

    const table = $('#waiversTable');
    try { table.DataTable().destroy(); } catch (e) { /* ignore */ }
    table.DataTable({
      data: ordered.map(p => [
        p.rank ?? '',
        `<span class="fw-semibold">${p.nombre}</span>`,
        p.team ?? '',
        p.position ?? '',
        `<span class="badge" style="background-color:${getTierColor(p.tier)}; color:#fff;">${p.tier ?? '-'}</span>`,
        p.leagueWinnerScore ?? 0,
        p.breakoutIndex ?? 0,
        p.byeWeek ?? '',
        renderStatus(p.injuryStatus)
      ]),
      columns: [
        { title: 'Rank' },
        { title: 'Jugador' },
        { title: 'Equipo' },
        { title: 'Posición' },
        { title: 'Tier' },
        { title: 'Winner' },
        { title: 'Breakout' },
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

  function getPositionColor(position) {
    switch ((position || '').toUpperCase()) {
      case 'QB': return '#ff2a6d';
      case 'RB': return '#00ceb8';
      case 'WR': return '#58a7ff';
      case 'TE': return '#ffae58';
      case 'K': return '#9d79ff';
      case 'DEF': return '#5c636a';
      default: return '#6c757d';
    }
  }

  function getTierColor(tier) {
    switch ((tier || '').toUpperCase()) {
      case 'A': return '#198754'; // verde (bootstrap success)
      case 'B': return '#0d6efd'; // azul (bootstrap primary)
      case 'C': return '#fd7e14'; // naranja (bootstrap warning)
      case 'D': return '#6c757d'; // gris (bootstrap secondary)
      default:  return '#343a40'; // oscuro
    }
  }

  function renderCard(p) {
    const color = getPositionColor(p.position);
    const tierColor = getTierColor(p.tier);
    return `
      <div class="col-12 col-md-6 col-lg-4">
        <div class="card shadow-sm border-0 h-100">
          <div class="card-body d-flex flex-column">
            <h6 class="card-title mb-1 fw-bold">
              <span class="badge me-2" style="background-color:${color}; color:#fff;">
                ${p.position || ''}
              </span>
              ${p.nombre}
            </h6>
            <small class="text-muted mb-2">${p.team || ''} • Bye ${p.byeWeek || '-'}</small>

            <div class="mb-2">
              <span class="badge" style="background-color:${tierColor}; color:#fff;">Tier ${p.tier || '-'}</span>
              <span class="badge bg-dark ms-1">${p.roleTag || '-'}</span>
              <span class="badge bg-light text-dark ms-1">Week: ${inputWeek.value || '-'}</span>
            </div>

            <p class="small text-muted mb-2">${p.bidReason || ''}</p>

            <div class="d-flex flex-wrap gap-1 mb-2">
              <span class="badge bg-info text-dark">FAAB: ${p.faabMin ?? '-'}-${p.faabMax ?? '-' }%</span>
              <span class="badge bg-success">Breakout: ${p.breakoutIndex ?? 0}</span>
              <span class="badge bg-primary">Winner: ${p.leagueWinnerScore ?? 0}</span>
            </div>

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
