// frontend/src/views/waivers.js
import { fetchWaiversData, fetchLineupData } from '../api.js';
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
          <div class="d-flex gap-2">
            <button class="btn btn-sm btn-outline-secondary" id="btn-open-team" data-bs-toggle="offcanvas" data-bs-target="#teamOffcanvas" aria-controls="teamOffcanvas">
              <i class="bi bi-card-list"></i> Mi Equipo
            </button>
            <button class="btn btn-sm btn-primary" id="btn-update-waivers">
              <i class="bi bi-arrow-clockwise"></i> Actualizar
            </button>
          </div>
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

        <!-- Contenedor de tarjetas (grid moderno) -->
        <div id="waiversCards" class="row waivers-grid"></div>

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

    <!-- Offcanvas: Mi Equipo -->
    <div class="offcanvas offcanvas-end" tabindex="-1" id="teamOffcanvas" aria-labelledby="teamOffcanvasLabel">
      <div class="offcanvas-header">
        <h5 id="teamOffcanvasLabel" class="text-flock mb-0">Mi Equipo</h5>
        <button type="button" class="btn-close btn-close-white text-reset" data-bs-dismiss="offcanvas" aria-label="Cerrar"></button>
      </div>
      <div class="offcanvas-body">
        <div class="mb-3 d-flex justify-content-between align-items-center">
          <div class="small text-secondary" id="teamMeta">-</div>
          <div>
            <button id="btn-refresh-team" class="btn btn-sm btn-accent"><i class="bi bi-arrow-clockwise"></i> Refrescar</button>
          </div>
        </div>

        <div id="teamContent">
          <!-- Starters -->
          <div class="mb-3">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <div class="text-flock">Titulares</div>
              <div class="small text-secondary" id="startersCount">0</div>
            </div>
            <div id="startersList" class="list-group"></div>
          </div>

          <!-- Bench -->
          <div>
            <div class="d-flex justify-content-between align-items-center mb-2">
              <div class="text-flock">Bench</div>
              <div class="small text-secondary" id="benchCount">0</div>
            </div>
            <div id="benchList" class="list-group"></div>
          </div>
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

  // PAGINACIÓN: filas y columnas → 6 filas por página, 3 columnas responsivas (desktop)
  let currentPage = 1;
  const rowsPerPage = 6;
  const cols = 3;
  const pageSize = rowsPerPage * cols; // 18 cards por página
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
  document.getElementById('btn-open-team').addEventListener('click', (e) => {
    // offcanvas se abre automáticamente por data-bs-*; aquí solo evitamos comportamientos no deseados
    // la carga real sucede en show.bs.offcanvas (ver más abajo)
  });

  // refresh inside offcanvas
  document.getElementById('btn-refresh-team').addEventListener('click', () => {
    const offcanvasEl = document.getElementById('teamOffcanvas');
    // re-trigger load (reads current selects)
    loadTeamInfo();
  });

	let lineupRanks = new Map(); // sleeperId(string) → rank(number)
	let lineupPlayers = [];      // array de { sleeperId, rank, position, nombre }

	async function loadLineupRanks(leagueId, idExpert, week) {
	  try {
	    const { starters = [], bench = [] } = await fetchLineupData(leagueId, idExpert, week) || {};
	    const allPlayersLocal = [...starters, ...bench];

	    lineupRanks.clear();
	    lineupPlayers = [];

	    allPlayersLocal.forEach(p => {
	      const id = p.sleeperId != null ? String(p.sleeperId) : null;
	      const rankNum = Number(p.rank ?? 99999);
	      if (id) lineupRanks.set(id, rankNum);

	      lineupPlayers.push({
	        sleeperId: id,
	        rank: rankNum,
	        position: (p.position || '').toUpperCase(),
	        nombre: p.nombre || ''
	      });
	    });

	  } catch (err) {
	    console.error('Error cargando lineup:', err.message);
	  }
	}

  // CARGA Y RENDER DEL OFFCANVAS - MI EQUIPO
  async function loadTeamInfo(leagueIdParam, idExpertParam, weekParam) {
    const leagueId = leagueIdParam ?? leagueSelect.value;
    const expertValue = idExpertParam ?? expertSelect.value;
    const selectedOption = expertSelect.selectedOptions[0];
    const idExpert = idExpertParam ?? (selectedOption?.dataset?.id || '');
    const week = Number(weekParam ?? inputWeek.value) || '';

    if (!leagueId || !idExpert) {
      showError('Selecciona una liga y un experto antes de ver tu equipo');
      return;
    }

    try {
      showLoadingBar('Cargando Equipo', 'Consultando lineup...');
      const res = await fetchLineupData(leagueId, idExpert, week);
      Swal.close();

      if (!res || !res.starters) {
        showError('No se pudo obtener la información del equipo');
        return;
      }

      // Actualizamos lineupRanks también
      const { starters = [], bench = [], meta = {} } = res;
      lineupRanks.clear();
      [...starters, ...bench].forEach(p => {
        if (p.sleeperId) lineupRanks.set(p.sleeperId, Number(p.rank ?? 99999));
      });

      renderTeamOffcanvas({ starters, bench, meta });
    } catch (err) {
      Swal.close();
      showError('Error al obtener equipo: ' + err.message);
    }
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

  function renderPlayerRow(p) {
    const posColor = getPositionColor(p.position);
    const rank = p.rank != null ? Number(p.rank) : 99999;
    const bye = p.byeWeek ?? '-';
    const safeName = p.nombre || '';
    const safeTeam = p.team || '';

		return `
		  <div class="list-group-item d-flex justify-content-between align-items-center"
		       style="background:transparent; border:1px solid var(--border); border-radius:8px; margin-bottom:8px;">
		    <div class="d-flex align-items-center gap-3">
		      <div style="min-width:56px; text-align:center;">
		        <div style="font-weight:800; font-size:1.05rem; color:var(--accent); background:rgba(255,122,0,0.06); padding:6px 8px; border-radius:8px;">
		          ${rank}
		        </div>
		      </div>
		      <div>
		        <div style="font-weight:700; font-size:0.98rem; color:#495057">${safeName}</div>
		        <div style="color:#495057; font-size:0.86rem;">${safeTeam} • Bye ${bye}</div>
		      </div>
		    </div>
		    <div class="text-end">
		      <div style="display:inline-block; padding:6px 8px; border-radius:8px; font-weight:700; background:${posColor}; color:#fff;">
		        ${p.position || '-'}
		      </div>
		    </div>
		  </div>
		`;
  }

  function renderTeamOffcanvas({ starters = [], bench = [], meta = {} } = {}) {
    document.getElementById('teamMeta').textContent = meta.published ? `Última: ${meta.published}` : '-';
    document.getElementById('startersCount').textContent = starters.length;
    document.getElementById('benchCount').textContent = bench.length;

    const startersList = document.getElementById('startersList');
    const benchList = document.getElementById('benchList');

    startersList.innerHTML = starters.map(p => renderPlayerRow(p)).join('') || '<div class="small text-secondary">No hay titulares</div>';
    benchList.innerHTML = bench.map(p => renderPlayerRow(p)).join('') || '<div class="small text-secondary">No hay bench</div>';
  }

  // Cuando el offcanvas se abra, cargamos la info (lee selects actuales)
  const offcanvasEl = document.getElementById('teamOffcanvas');
  if (offcanvasEl) {
    offcanvasEl.addEventListener('show.bs.offcanvas', () => {
      // no repetimos parámetros: loadTeamInfo lee los selects internos
      loadTeamInfo();
    });
  }

  async function loadWaiversData() {
    const leagueId = leagueSelect.value;
    const selectedOption = expertSelect.selectedOptions[0];
    const expertValue = expertSelect.value;
    const idExpert = selectedOption?.dataset.id || '';
    const week = Number(inputWeek.value) || '';

    if (!leagueId || !idExpert) return showError('Selecciona una liga y un experto');

    localStorage.setItem('waiversLeague', leagueId);
    localStorage.setItem('waiversExpert', expertValue);

    try {
      showLoadingBar('Cargando Waivers', 'Consultando información...');
      const { freeAgents, meta } = await fetchWaiversData(leagueId, idExpert, week);

      // ⚡ Comparar con tu lineup
      await loadLineupRanks(leagueId, idExpert, week);

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
    // Con grid Bootstrap: cada item usa col-*
    container.innerHTML = `
      <div class="row g-3">
        ${pageData.map(p => renderCard(p)).join('')}
      </div>
    `;

    document.getElementById('pagination-info').textContent =
      `Página ${currentPage} de ${totalPages || 1}`;
    document.getElementById('prev-page').disabled = currentPage <= 1;
    document.getElementById('next-page').disabled = currentPage >= totalPages;

		const popoverTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="popover"]'));
		popoverTriggerList.map(el => new bootstrap.Popover(el));
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

  function getTierColor(tier) {
    switch ((tier || '').toUpperCase()) {
      case 'A': return '#198754';
      case 'B': return '#0d6efd';
      case 'C': return '#fd7e14';
      case 'D': return '#6c757d';
      default:  return '#343a40';
    }
  }

	function renderCard(p) {
	  const posColor = getPositionColor(p.position);
	  const tierColor = getTierColor(p.tier);
	  const safeName = p.nombre || '';
	  const safeTeam = p.team || '';
	  const bye = p.byeWeek ?? '-';
	  const rankNum = (p.rank != null && p.rank !== '-') ? Number(p.rank) : 99999;
	  const roleClass = (p.roleTag || 'stash').toLowerCase().replace(/\s+/g, '-');

	  // badge blanco para bidReason (visibilidad sobre fondo oscuro)
	  const reasonBadge = p.bidReason
	    ? `<div style="margin-top:4px; max-width:100%; overflow:hidden;">
	         <span class="badge" style="
	           background: linear-gradient(#fff, #f2f2f2);
	           color:#111;
	           border:1px solid var(--border);
	           box-shadow:0 1px 3px rgba(0,0,0,0.25);
	           font-weight:600;
	           white-space:normal;
	           word-break:break-word;
	         ">
	           <i class="bi bi-lightning-charge-fill me-1"></i>${p.bidReason}
	         </span>
	       </div>`
	    : '';

	  // --- Comparación: waiversRank vs todos los ranks de tu equipo (excluyendo K/DEF) ---
	  const lineupFiltered = lineupPlayers.filter(lp => lp.position && !['K', 'DEF'].includes(lp.position));
	  const comparisonCount = lineupFiltered.filter(lp => rankNum < Number(lp.rank)).length;

	  let betterBadge = '';
	  if (!['K', 'DEF'].includes((p.position || '').toUpperCase()) && comparisonCount > 0) {
	    const samePos = lineupFiltered.filter(lp => lp.position === p.position);
	    const betterSamePos = samePos.filter(lp => rankNum < lp.rank).length;

	    betterBadge = `
	      <button type="button"
	              class="btn btn-sm btn-link p-0 ms-2 text-warning"
	              data-bs-toggle="popover"
	              data-bs-trigger="focus"
	              data-bs-placement="top"
	              data-bs-content="Mejor que ${comparisonCount}/${lineupFiltered.length} de tu roster • ${betterSamePos}/${samePos.length} en ${p.position}">
	        <i class="bi bi-graph-up-arrow"></i>
	      </button>`;
	  }

	  return `
	    <div class="col-12 col-md-6 col-lg-4">
	      <div class="waiver-card h-100">
	        <div class="d-flex justify-content-between align-items-start mb-2">
	          <div>
	            <div class="waiver-pos-bubble" style="background:${posColor}; color:#fff;">
	              ${p.position || ''}
	            </div>
	            <div class="waiver-name">${safeName}</div>
	            <div class="waiver-pos" style="color:#dee2e6; font-size:0.85rem; font-weight:500;">
	              ${safeTeam} • Bye ${bye}
	            </div>
	          </div>
	          <div class="waiver-rank">${rankNum === 99999 ? '-' : rankNum}</div>
	        </div>

	        <div class="waiver-body">
	          <span class="waiver-tag role-${roleClass}">${p.roleTag || '-'}</span>
	          <span class="waiver-tier" style="background:${tierColor}; color:#fff;">Tier ${p.tier || '-'}</span>
	          <span class="waiver-score">Winner ${p.leagueWinnerScore ?? 0}</span>
	          ${betterBadge}
	        </div>

	        ${reasonBadge}

	        <div class="d-flex justify-content-between align-items-center mt-auto">
	          <div class="d-flex flex-wrap gap-1">
	            <span class="badge bg-info text-dark">FAAB: ${p.faabMin ?? '-'}-${p.faabMax ?? '-'}%</span>
	            <span class="badge bg-success">Breakout: ${p.breakoutIndex ?? 0}</span>
	          </div>
	          <div>${renderStatus(p.injuryStatus)}</div>
	        </div>
	      </div>
	    </div>
	  `;
	}

  function renderStatus(status) {
    if (!status) return '<span class="badge bg-success">Healthy</span>';
    return `<span class="badge bg-warning text-dark">${status}</span>`;
  }

  // Eventos
  document.getElementById('filter-position').addEventListener('change', () => { currentPage = 1; render(); });
  document.getElementById('filter-team').addEventListener('change', () => { currentPage = 1; render(); });
  document.getElementById('search-player').addEventListener('input', () => { currentPage = 1; render(); });

  document.getElementById('prev-page').addEventListener('click', () => {
    if (currentPage > 1) { currentPage--; render(); }
  });
  document.getElementById('next-page').addEventListener('click', () => {
    const filtered = getFilteredPlayers();
    const totalPages = Math.ceil(filtered.length / pageSize);
    if (currentPage < totalPages) { currentPage++; render(); }
  });

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
	// 🔧 Fix: evitar que el offcanvas reduzca la pantalla principal
	document.addEventListener('hidden.bs.offcanvas', () => {
		document.body.style.removeProperty('padding-right');
	});
}
