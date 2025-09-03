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

        <!-- Controles de filtrado -->
        <div class="row g-3 mb-4">
          <div class="col-md-3">
            <select id="filter-position" class="form-select">
              <option value="">Todas las posiciones</option>
              <option value="QB">QB</option>
              <option value="RB">RB</option>
              <option value="WR">WR</option>
              <option value="TE">TE</option>
              <option value="K">K</option>
              <option value="DST">DST</option>
            </select>
          </div>
          <div class="col-md-3">
            <select id="filter-team" class="form-select">
              <option value="">Todos los equipos</option>
            </select>
          </div>
          <div class="col-md-3">
            <select id="sort-by" class="form-select">
              <option value="rank">Ordenar por Rank</option>
              <option value="nombre">Ordenar por Nombre</option>
              <option value="position">Ordenar por Posición</option>
            </select>
          </div>
        </div>

        <!-- Contenedor de tarjetas -->
        <div id="waiversCards" class="row g-3"></div>

        <!-- Paginación -->
        <div class="d-flex justify-content-between align-items-center mt-4">
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

  // Estado para paginación
  let currentPage = 1;
  const pageSize = 12;
  let allPlayers = [];

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
      renderCards();

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

  function renderCards() {
    const posFilter = document.getElementById('filter-position').value;
    const teamFilter = document.getElementById('filter-team').value;
    const sortBy = document.getElementById('sort-by').value;

    let filtered = allPlayers
      .filter(p => !posFilter || p.position === posFilter)
      .filter(p => !teamFilter || p.team === teamFilter);

    filtered.sort((a, b) => {
      if (sortBy === 'rank') return (a.rank ?? 9999) - (b.rank ?? 9999);
      if (sortBy === 'nombre') return a.nombre.localeCompare(b.nombre);
      if (sortBy === 'position') return a.position.localeCompare(b.position);
      return 0;
    });

    const totalPages = Math.ceil(filtered.length / pageSize);
    if (currentPage > totalPages) currentPage = totalPages || 1;
    const start = (currentPage - 1) * pageSize;
    const pageData = filtered.slice(start, start + pageSize);

    const container = document.getElementById('waiversCards');
    container.innerHTML = pageData.map(p => renderCard(p)).join('');

    document.getElementById('pagination-info').textContent =
      `Página ${currentPage} de ${totalPages || 1}`;
    document.getElementById('prev-page').disabled = currentPage <= 1;
    document.getElementById('next-page').disabled = currentPage >= totalPages;
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

  // Eventos de filtros y paginación
  document.getElementById('filter-position').addEventListener('change', () => { currentPage = 1; renderCards(); });
  document.getElementById('filter-team').addEventListener('change', () => { currentPage = 1; renderCards(); });
  document.getElementById('sort-by').addEventListener('change', () => { currentPage = 1; renderCards(); });
  document.getElementById('prev-page').addEventListener('click', () => { currentPage--; renderCards(); });
  document.getElementById('next-page').addEventListener('click', () => { currentPage++; renderCards(); });

  if (savedLeague && savedExpert) loadWaiversData();
}
