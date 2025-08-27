import { showSuccess, showError, showLoadingBar } from '../../components/alerts.js';
import { positions } from '../../components/constants.js';
import { renderLeagueSelect } from '../../components/selectLeagues.js';
import { fetchConsensusData } from '../api.js';

export default async function renderConsensusDraft() {
  const content = document.getElementById('content-container');
  if (!content) return showError('No se encontró el contenedor de contenido.');

  // Evitar doble inicialización si la vista se monta varias veces
  if (content.dataset.consensusInitialized === 'true') {
    // Re-render layout (limpia grid y reusa listeners existentes)
    content.querySelector('#draft-grid')?.remove();
    content.innerHTML = '';
    content.dataset.consensusInitialized = '';
  }

  content.innerHTML = `
    <style>
      .draft-card { background:var(--bg-secondary,#1f2228); color:var(--text-primary,#e4e6eb); border:1px solid var(--border,#2f3033); border-radius:12px; padding:.75rem; height:100%; }
      .pos-badge { padding:.2rem .5rem; border-radius:.35rem; font-weight:600; display:inline-block; }
      .controls-row { display:flex; gap:.5rem; flex-wrap:wrap; align-items:center; margin-bottom:.75rem; }
      .small-muted { font-size:.85rem; color:var(--text-secondary,#b0b3b8); }
      .pagination-controls { display:flex; gap:.4rem; align-items:center; flex-wrap:wrap; }
      .page-btn { min-width:36px; text-align:center; padding:.2rem .5rem; cursor:pointer; border-radius:.35rem; border:1px solid rgba(255,255,255,.06); background:transparent; color:inherit; }
      .page-btn[disabled] { opacity:.45; cursor:not-allowed; }
      .expert-mini { font-size:0.82rem; color:var(--text-secondary,#b0b3b8); }
      .flock-card { background: transparent; }
      .flock-offcanvas { color:var(--text-primary); background:var(--bg-primary); }

      /* Badges de flags booleanos */
      .flags-row { display:flex; flex-wrap:wrap; gap:.35rem; }
      .flag-badge {
        width:26px; height:26px; border-radius:999px;
        display:inline-flex; align-items:center; justify-content:center;
        border:1px solid rgba(255,255,255,.12);
        background:rgba(255,255,255,.04);
        font-size:1rem; line-height:1;
      }
      .flag-muted { color:#b0b3b8; }
      .flag-green { color:#00d084; border-color:rgba(0,208,132,.35); background:rgba(0,208,132,.10); }
      .flag-blue { color:#58a7ff; border-color:rgba(88,167,255,.35); background:rgba(88,167,255,.10); }
      .flag-purple { color:#bd7bff; border-color:rgba(189,123,255,.35); background:rgba(189,123,255,.10); }
      .flag-orange { color:#ffae58; border-color:rgba(255,174,88,.35); background:rgba(255,174,88,.10); }
      .flag-red { color:#ff5a5f; border-color:rgba(255,90,95,.35); background:rgba(255,90,95,.10); }

      /* ---- Offcanvas lineup / slots ---- */
      .lineup-section-title { font-size:.85rem; color:var(--text-secondary,#b0b3b8); letter-spacing:.02em; text-transform:uppercase; }
      .lineup-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.6rem; }
      @media (min-width: 768px){ .lineup-grid{ grid-template-columns:repeat(3,minmax(0,1fr)); } }
      .slot-card {
        border:1px dashed rgba(255,255,255,.12);
        background: linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.01));
        border-radius:12px; padding:.6rem; min-height:72px; display:flex; gap:.6rem; align-items:flex-start;
      }
      .slot-badge {
        align-self:flex-start; font-weight:700; font-size:.75rem; padding:.2rem .45rem;
        border-radius:.5rem; border:1px solid rgba(255,255,255,.14); background:rgba(255,255,255,.06);
        color:var(--text-secondary,#b0b3b8);
      }
      .slot-empty { opacity:.7; font-size:.9rem; display:flex; align-items:center; color:var(--text-secondary,#b0b3b8); }
      .slot-player { display:flex; flex-direction:column; min-width:0; }
      .slot-player .name { font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .slot-meta { font-size:.8rem; color:var(--text-secondary,#b0b3b8); display:flex; gap:.5rem; flex-wrap:wrap; }
      .bench-list .list-group-item { background:transparent; color:var(--text-primary); border-color:rgba(255,255,255,.08); }

      /* Scoring pill visible en header */
      .scoring-pill { display:inline-flex; gap:.45rem; align-items:center; padding:.25rem .6rem; border-radius:999px; border:1px solid var(--border,#2f3033); background:rgba(255,255,255,.02); color:var(--text-secondary,#b0b3b8); font-weight:600; }
    </style>

    <div class="card border-0 shadow-sm rounded flock-card">
      <div class="card-body d-flex flex-column min-h-0">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h4 class="m-0 d-flex align-items-center gap-2">
            <i class="bi bi-list-stars text-warning"></i> Draft Simple
          </h4>
          <div class="d-flex gap-2 align-items-center">
            <!-- Scoring visible a simple vista -->
            <div id="scoring-label" class="scoring-pill" title="Tipo de scoring">Scoring: —</div>
            <div class="d-flex gap-2 ms-2">
              <button id="btn-open-drafted" class="btn btn-sm btn-outline-light" data-bs-toggle="offcanvas" data-bs-target="#offcanvasDrafted" aria-controls="offcanvasDrafted">
                <i class="bi bi-people"></i>
              </button>
              <button id="btn-refresh-draft" class="btn btn-sm btn-outline-light"><i class="bi bi-arrow-clockwise"></i> Actualizar</button>
            </div>
          </div>
        </div>

        <form class="row g-3 mb-3">
          <div class="col-md-3">
            <label class="form-label">Liga</label>
            <select id="select-league" class="form-select"></select>
          </div>
          <div class="col-md-2">
            <label class="form-label">Posición</label>
            <select id="select-position" class="form-select">
              <option value="ALL">ALL</option>
              ${positions.map(p => `<option value="${p.nombre}">${p.nombre}</option>`).join('')}
            </select>
          </div>
          <div class="col-md-2">
            <label class="form-label">Status</label>
            <select id="select-status" class="form-select">
              <option value="LIBRE">LIBRE</option>
              <option value="TODOS">TODOS</option>
            </select>
          </div>
          <div class="col-md-2">
            <label class="form-label">Bye condición</label>
            <input id="input-bye" type="number" class="form-control" placeholder="0">
          </div>
          <div class="col-md-2 d-flex align-items-end">
            <div class="form-check">
              <input id="chk-sleeperADP" class="form-check-input" type="checkbox">
              <label class="form-check-label">Sleeper ADP</label>
            </div>
          </div>
        </form>

        <div class="d-flex flex-wrap gap-2 align-items-center mb-2">
          <div id="ranks-updated-label" class="small-muted"></div>
          <div id="adp-updated-label" class="small-muted"></div>
          <!-- scoring-label también existe en header, mantenemos este campo vacío: -->
        </div>

        <div class="controls-row mb-2">
          <input id="draft-search" class="form-control form-control-sm" placeholder="Buscar por nombre, equipo, posición..." style="min-width:220px;">
          <div style="margin-left:auto; display:flex; gap:.5rem; align-items:center;">
            <label class="m-0">Mostrar
              <select id="page-size" class="form-select form-select-sm ms-1" style="width:auto; display:inline-block;">
                <option value="8">8</option>
                <option value="12" selected>12</option>
                <option value="20">20</option>
                <option value="40">40</option>
              </select>
            registros
            </label>
            <label class="m-0 ms-2">Ordenar
              <select id="draft-sort-by" class="form-select form-select-sm ms-1" style="width:auto; display:inline-block;">
                <option value="avg_rank">Avg Rank</option>
                <option value="adpRound">ADP Round</option>
                <option value="valueOverADP">Value/ADP</option>
              </select>
            </label>
            <label class="m-0 ms-2">Dir
              <select id="draft-sort-dir" class="form-select form-select-sm ms-1" style="width:auto; display:inline-block;">
                <option value="asc">Asc</option>
                <option value="desc">Desc</option>
              </select>
            </label>
          </div>
        </div>

        <div id="ranksummary" class="mb-3"></div>

        <div id="draft-grid" class="row g-3"></div>
        <div id="draft-empty" class="text-center text-secondary py-4 d-none">
          <i class="bi bi-inbox"></i>
          <div class="mt-2">No hay jugadores que coincidan con los filtros.</div>
        </div>

        <div class="d-flex justify-content-between align-items-center mt-3">
          <div id="cards-info" class="text-muted small"></div>
          <div id="pagination" class="pagination-controls"></div>
        </div>
      </div>
    </div>

    <!-- Offcanvas: Mis drafteados -->
    <div class="offcanvas offcanvas-end flock-offcanvas" tabindex="-1" id="offcanvasDrafted">
      <div class="offcanvas-header border-secondary">
        <h5 class="offcanvas-title d-flex align-items-center gap-2">
          <i class="bi bi-people-fill text-flock"></i>
          Mi equipo · <span id="drafted-count" class="badge bg-primary">0</span>
        </h5>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="offcanvas" aria-label="Close"></button>
      </div>
      <div class="offcanvas-body">
        <div id="drafted-list"></div>
      </div>
      <div class="offcanvas-footer p-3 border-top border-secondary d-flex gap-2 justify-content-end">
        <button class="btn btn-outline-light" data-bs-dismiss="offcanvas">Cerrar</button>
      </div>
    </div>
  `;

  // marcar inicializado para evitar doble binding
  content.dataset.consensusInitialized = 'true';

  // -------------------------
  // Refs y estado
  // -------------------------
  const leagueSelect = document.getElementById('select-league');
  const positionSelect = document.getElementById('select-position');
  const statusSelect = document.getElementById('select-status');
  const byeInput = document.getElementById('input-bye');
  const sleeperADPCheckbox = document.getElementById('chk-sleeperADP');
  const searchInput = document.getElementById('draft-search');
  const pageSizeSel = document.getElementById('page-size');
  const sortBySel = document.getElementById('draft-sort-by');
  const sortDirSel = document.getElementById('draft-sort-dir');
  const grid = document.getElementById('draft-grid');
  const empty = document.getElementById('draft-empty');
  const ranksUpdatedLabel = document.getElementById('ranks-updated-label');
  const adpUpdatedLabel = document.getElementById('adp-updated-label');
  const scoringLabel = document.getElementById('scoring-label');
  const btnRefresh = document.getElementById('btn-refresh-draft');
  const btnOpenDrafted = document.getElementById('btn-open-drafted');
  const cardsInfo = document.getElementById('cards-info');
  const paginationEl = document.getElementById('pagination');

  let draftData = [];
  let filtered = [];
  let myDrafted = [];
  let starterSlots = []; // array de posiciones titulares según el endpoint
  let currentPage = 1;
  let pageSize = Number(pageSizeSel.value) || 12;
  let searchQuery = '';

  // concurrency control
  let currentAbortController = null;
  let lastLoadSeq = 0;
  let leagueSelectInitialized = false; // para evitar onChange inicial

  // restore localstorage
  try { positionSelect.value = localStorage.getItem('consensusPosition') || positionSelect.value; } catch(e){}
  try { statusSelect.value = localStorage.getItem('consensusStatus') || statusSelect.value; } catch(e){}
  try { sleeperADPCheckbox.checked = (localStorage.getItem('consensusSleeperADP') === 'true') || false; } catch(e){}

  // -------------------------
  // Helpers
  // -------------------------
  function debounce(fn, wait = 200) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }
  function escapeHtml(str) {
    return String(str ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;");
  }
  const safeNum = (v, decimals = 2) => (typeof v === 'number' && Number.isFinite(v)) ? Number(v.toFixed(decimals)) : (Number.isFinite(+v) ? Number(Number(v).toFixed(decimals)) : '');
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function getPositionColor(position) {
    switch ((position || '').toUpperCase()) {
      case 'QB': return '#ff2a6d';
      case 'RB': return '#00ceb8';
      case 'WR': return '#58a7ff';
      case 'TE': return '#ffae58';
      default:   return '#6c757d';
    }
  }
  function getContrastTextColor(hex) {
    hex = (hex || '').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const r = parseInt(hex.substr(0,2),16), g = parseInt(hex.substr(2,2),16), b = parseInt(hex.substr(4,2),16);
    const luminance = (0.299*r + 0.587*g + 0.114*b)/255;
    return luminance > 0.6 ? '#000' : '#fff';
  }
  function getPositionBadge(pos) {
    const bg = getPositionColor(pos);
    const textColor = getContrastTextColor(bg);
    return `<span class="pos-badge" style="background:${bg};color:${textColor};">${pos ?? ''}</span>`;
  }

  // Badges booleanos
  function flagBadge(val, icon, title, onClass, offClass = 'flag-muted') {
    const cls = val ? onClass : offClass;
    const state = val ? 'Sí' : 'No';
    return `
      <span class="flag-badge ${cls}" data-bs-toggle="tooltip" data-bs-placement="top" title="${escapeHtml(title)}: ${state}">
        <i class="bi ${icon}"></i>
      </span>`;
  }
  function renderBooleanFlags(p) {
    // rookie (morado), byeFound (azul), teamFound (verde/teal), goodOffense (naranja), byeConflict (rojo cuando true)
    return `
      <div class="flags-row mt-2">
        ${flagBadge(!!p.rookie, 'bi-stars', 'Rookie', 'flag-purple')}
        ${flagBadge(!!p.byeFound, 'bi-calendar-check', 'Bye detectado', 'flag-blue')}
        ${flagBadge(!!p.teamFound, 'bi-shield-check', 'Equipo confirmado', 'flag-green')}
        ${flagBadge(!!p.goodOffense, 'bi-graph-up-arrow', 'Ofensiva favorable', 'flag-orange')}
        ${flagBadge(!!p.byeConflict, 'bi-exclamation-octagon-fill', 'Conflicto de bye', 'flag-red')}
      </div>
    `;
  }

  function normalizePlayers(arr = []) {
    const toNum = (v) => (Number.isFinite(+v) ? +v : null);

    return (arr || []).map(p => {
      // Normalizar status
      let status = (p.status || '').trim().toUpperCase();
      if (status === 'LIBRE') {
        status = 'LIBRE';      // jugador disponible
      } else {
        status = 'DRAFTED';    // cualquier otro valor vacío → Drafted
      }

      return {
        ...p,
        status,                 // agregamos status normalizado
        avg_rank: toNum(p.avg_rank),
        adpRound: toNum(p.adpRound),
        projection: toNum(p.projection),   // se mantiene solo para SharkScore
        valueOverADP: toNum(p.valueOverADP),
        vor: toNum(p.vor),
        adjustedVOR: toNum(p.adjustedVOR),
        dropoff: toNum(p.dropoff),
        stealScore: toNum(p.stealScore),
        volatility: toNum(p.volatility),
        tier_global: toNum(p.tier_global),
        tier_pos: toNum(p.tier_pos),
        // badges nuevos: rookie, byeFound, teamFound, goodOffense, byeConflict
        rookie: !!p.rookie,
        byeFound: !!p.byeFound,
        teamFound: !!p.teamFound,
        goodOffense: !!p.goodOffense,
        byeConflict: !!p.byeConflict
      };
    });
  }

  // shark helpers (intact)
  function _rangeFrom(arr, pick) {
    const vals = arr.map(pick).map(Number).filter(Number.isFinite);
    if (!vals.length) return [0,1];
    return [Math.min(...vals), Math.max(...vals)];
  }
  function _scale01(v, [min, max], def = 0) {
    const x = Number(v);
    if (!Number.isFinite(x)) return def;
    if (max <= min) return 0.5;
    return (x - min) / (max - min);
  }
  function _buildSharkRanges(source) {
    const arr = source && source.length ? source : [];
    return {
      rank: _rangeFrom(arr, p => p.avg_rank),
      adjustedVOR: _rangeFrom(arr, p => p.adjustedVOR),
      projection: _rangeFrom(arr, p => p.projection),
      valueOverADP: _rangeFrom(arr, p => p.valueOverADP),
      stealScore: _rangeFrom(arr, p => p.stealScore),
      volatility: _rangeFrom(arr, p => p.volatility),
      tier_global: _rangeFrom(arr, p => p.tier_global),
    };
  }
  function computeSharkScore(p, R) {
    const rnkN = _scale01(p.avg_rank, R.rank, 1);
    const adjVN = _scale01(p.adjustedVOR, R.adjustedVOR, 0);
    const projN = _scale01(p.projection, R.projection, 0);
    const voaN = _scale01(p.valueOverADP, R.valueOverADP, 0);
    const stealN = _scale01(p.stealScore, R.stealScore, 0);
    const boomN = Math.max(0, Math.min(1, Number(p.boomRate) / 100));
    const bustN = Math.max(0, Math.min(1, Number(p.bustRate) / 100));
    const consN = Math.max(0, Math.min(1, Number(p.consistency) / 100));
    const volN = _scale01(p.volatility, R.volatility, 0.5);
    const tierInvN = 1 - _scale01(p.tier_global, R.tier_global, 1);
    const anchor = (1 - rnkN);
    const valueEdge = voaN * (0.4 + 0.6 * anchor);

    let score =
      0.45 * anchor +
      0.20 * adjVN +
      0.10 * projN +
      0.08 * valueEdge +
      0.07 * boomN +
      0.05 * consN +
      0.03 * tierInvN +
      0.02 * stealN -
      0.10 * bustN -
      0.05 * volN;

    if (Number.isFinite(p.avg_rank) && p.avg_rank > 100) score -= 0.0025 * (p.avg_rank - 100);
    return score;
  }

  // -------------------------
  // Renderers
  // -------------------------
  function renderPlayersGrid() {
    const list = filtered || [];
    if (!list.length) {
      grid.innerHTML = '';
      empty.classList.remove('d-none');
      cardsInfo.textContent = 'Mostrando 0 de 0';
      paginationEl.innerHTML = '';
      return;
    }
    empty.classList.add('d-none');

    const start = (currentPage - 1) * pageSize;
    const pagePlayers = list.slice(start, start + pageSize);

    grid.innerHTML = pagePlayers.map(p => {
      const posBadge = getPositionBadge(p.position);
      const statusBadge = p.status === 'LIBRE'
      ? '<span class="badge bg-success">Libre</span>'
      : '<span class="badge bg-secondary">Drafted</span>';

      const expertsShort = (p.experts || []).slice(0,3).map(e => `${escapeHtml(e.expert)} (${safeNum(e.rank,2)})`).join(', ');
      const expertsMore = (p.experts || []).length > 3 ? ` +${(p.experts || []).length - 3} more` : '';

      return `
        <div class="col-12 col-md-6 col-lg-4">
          <div class="draft-card h-100 d-flex flex-column">
            <div class="d-flex justify-content-between align-items-start">
              <div class="min-w-0">
                <div class="fw-semibold text-truncate">${escapeHtml(p.nombre || '')}</div>
                <div class="small text-secondary mt-1">
                  ${posBadge} <span class="ms-1">${escapeHtml(p.team || '')}</span>
                  <span class="ms-2">Bye: <span class="text-white">${escapeHtml((p.bye ?? '—'))}</span></span>
                </div>
              </div>
              <div class="text-end">
                ${statusBadge}
              </div>
            </div>

            <div class="mt-2 d-flex gap-2 align-items-center small">
              <span class="badge bg-primary">Avg: ${safeNum(p.avg_rank,2)}</span>
              <span class="badge bg-info text-dark">ADP: ${safeNum(p.adpRound,2)}</span>
              <span class="badge bg-warning text-dark">Val/ADP: ${safeNum(p.valueOverADP,2)}</span>
              <div class="ms-auto small">${(p.riskTags||[]).join(', ')}</div>
            </div>

            ${renderBooleanFlags(p)}

            <div class="mt-2 d-flex gap-2 flex-wrap">
              ${p.valueTag ? `<span class="badge bg-success">${escapeHtml(p.valueTag)}</span>` : ''}
              ${p.tier_global_label ? `<span class="badge bg-danger">${escapeHtml(p.tier_global ?? '')} ${escapeHtml(p.tier_global_label)}</span>` : ''}
              ${p.tier_pos_label ? `<span class="badge bg-primary">${escapeHtml(p.tier_pos ?? '')} ${escapeHtml(p.tier_pos_label)}</span>` : ''}
            </div>

            ${(p.experts && p.experts.length) ? `<div class="mt-2 expert-mini">Experts: ${expertsShort}${expertsMore}</div>` : ''}

          </div>
        </div>
      `;
    }).join('');

    // Inicializar tooltips de Bootstrap en los nuevos badges
    try {
      const tipEls = grid.querySelectorAll('[data-bs-toggle="tooltip"]');
      tipEls.forEach(el => {
        try {
          // Bootstrap 5.2+: getOrCreateInstance
          window.bootstrap?.Tooltip?.getOrCreateInstance(el) || new bootstrap.Tooltip(el);
        } catch {
          // Fallback genérico
          new bootstrap.Tooltip(el);
        }
      });
    } catch (e) {}

    cardsInfo.textContent = `Mostrando ${start + 1}-${Math.min(start + pageSize, list.length)} de ${list.length} jugadores`;
    renderPagination();
  }

  function renderPagination() {
    const totalPages = Math.max(1, Math.ceil((filtered?.length || 0) / pageSize));
    const firstDisabled = currentPage === 1 ? 'disabled' : '';
    const lastDisabled = currentPage === totalPages ? 'disabled' : '';

    paginationEl.innerHTML = `
      <button class="page-btn" id="btn-first" ${firstDisabled}>«</button>
      <button class="page-btn" id="btn-prev" ${firstDisabled}>‹</button>
      <div style="padding:0 .6rem">Página <strong>${currentPage}</strong> / ${totalPages}</div>
      <button class="page-btn" id="btn-next" ${lastDisabled}>›</button>
      <button class="page-btn" id="btn-last" ${lastDisabled}>»</button>
    `;

    paginationEl.querySelector('#btn-first')?.addEventListener('click', () => { if (currentPage !== 1) { currentPage = 1; renderPlayersGrid(); renderPagination(); } });
    paginationEl.querySelector('#btn-prev')?.addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderPlayersGrid(); renderPagination(); } });
    paginationEl.querySelector('#btn-next')?.addEventListener('click', () => { const tot = Math.ceil(filtered.length / pageSize); if (currentPage < tot) { currentPage++; renderPlayersGrid(); renderPagination(); } });
    paginationEl.querySelector('#btn-last')?.addEventListener('click', () => { const tot = Math.ceil(filtered.length / pageSize); if (currentPage !== tot) { currentPage = tot; renderPlayersGrid(); renderPagination(); } });
  }

  // treat empty status as free
  function isFreeStatus(s) {
    const t = (s ?? '').toString().trim().toLowerCase();
    if (!t) return true;
    return ['LIBRE', 'libre', 'free', 'free agent', 'fa', 'available', 'waiver', 'waivers', 'waiver wire', 'waiver-wire', 'wa'].includes(t);
  }

  function applyFiltersAndSort() {
    const statusFilter = statusSelect.value || '';
    const posFilter = positionSelect.value || 'ALL';
    const byeCondition = Number(byeInput.value) || 0;
    const q = (searchQuery || '').trim().toLowerCase();

    filtered = (draftData || []).filter(p => {
      // STATUS
      if (statusFilter && statusFilter !== 'TODOS') {
        if (statusFilter === 'LIBRE') {
          if (!isFreeStatus(p.status)) return false;
        } else {
          if ((p.status || '').toUpperCase() !== statusFilter.toUpperCase()) return false;
        }
      }

      // POS
      if (posFilter && posFilter !== '' && posFilter !== 'ALL' && posFilter !== 'TODAS') {
        if ((p.position || '').toLowerCase() !== posFilter.toLowerCase()) return false;
      }

      // BYE (exclude players with bye > byeCondition)
      if (byeCondition > 0 && (Number(p.bye) || 0) > byeCondition) return false;

      // SEARCH
      if (q) {
        const haystack = [
          p.nombre, p.team, p.position,
          p.valueTag, p.tier_global_label, p.tier_pos_label,
          ...(p.riskTags || [])
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });

    // ORDEN
    if (sortBySel.value === 'shark') {
      const base = filtered.length ? filtered : draftData;
      const R = _buildSharkRanges(base);
      filtered.forEach(p => { p._shark = computeSharkScore(p, R); });
      filtered.sort((a, b) => (b._shark ?? -Infinity) - (a._shark ?? -Infinity));
    } else {
      const key = sortBySel.value || 'avg_rank';
      const dir = (sortDirSel.value === 'asc') ? 1 : -1;
      filtered.sort((a, b) => {
        const va = a?.[key], vb = b?.[key];
        const aNull = va === null || va === undefined;
        const bNull = vb === null || vb === undefined;
        if (aNull && bNull) return 0;
        if (aNull) return 1;
        if (bNull) return -1;
        if (va < vb) return -1 * dir;
        if (va > vb) return 1 * dir;
        const aa = a?.adpRound ?? Number.POSITIVE_INFINITY;
        const bb = b?.adpRound ?? Number.POSITIVE_INFINITY;
        if (aa < bb) return -1 * dir;
        if (aa > bb) return 1 * dir;
        return 0;
      });
    }

    currentPage = 1;
    renderPlayersGrid();
    renderPagination();
  }

  // -------------------------
  // loadConsensus with abort + seq protection
  // -------------------------
  async function loadConsensus() {
    // abort previous request (if any) to avoid race and extra Swals
    try { currentAbortController?.abort(); } catch (e) {}
    currentAbortController = new AbortController();
    const signal = currentAbortController.signal;
    const mySeq = ++lastLoadSeq;

    // show loading (try app helper, fallback to Swal)
    try {
      showLoadingBar('Cargando consenso', 'Esto puede tardar unos segundos');
    } catch (e) {
      try {
        Swal.fire({
          title: 'Cargando consenso',
          text: 'Esto puede tardar unos segundos',
          allowOutsideClick: false,
          didOpen: () => Swal.showLoading()
        });
      } catch (e2) {}
    }

    const safeHideLoading = () => {
      if (mySeq !== lastLoadSeq) return;
      try { Swal.close(); } catch(e) {}
    };

    try {
      const qsLeagueId = (() => {
        try {
          const url = new URL(window.location.href);
          return url.searchParams.get('leagueId') ?? '';
        } catch (e) { return ''; }
      })();

      const leagueId = (document.querySelector('#select-league')?.tomselect?.getValue?.() || leagueSelect.value || qsLeagueId || '').toString().trim();
      if (!leagueId) {
        safeHideLoading();
        return showError('Selecciona una liga (o añade ?leagueId=... en la URL).');
      }

      const position = positionSelect.value || 'ALL';
      const apiPosition = (position === 'ALL' || position === 'TODAS') ? 'TODAS' : position;
      const byeCond = Number(byeInput.value || 0);
      const sleeper = !!sleeperADPCheckbox.checked;

      const maybeOptions = { signal };
      const result = await fetchConsensusData(leagueId, apiPosition, byeCond, sleeper, maybeOptions);

      // if some other load started after this one, discard results
      if (mySeq !== lastLoadSeq) {
        safeHideLoading();
        return;
      }

      const players = result?.data || result?.players || [];
      const params = result?.params || result?.query || {};
      const apiMyDrafted = result?.my_drafted || result?.myDrafted || result?.myDraftedList || result?.myDrafted || [];
      const starters = result?.starterPositions;
      console.log(starters);
      draftData = normalizePlayers(players || []);

      // default ordering by avg_rank asc
      draftData.sort((a,b) => {
        const aa = a?.avg_rank ?? Number.POSITIVE_INFINITY;
        const bb = b?.avg_rank ?? Number.POSITIVE_INFINITY;
        if (aa < bb) return -1;
        if (aa > bb) return 1;
        return 0;
      });

      // normalize myDrafted to keep formato consistente
      myDrafted = normalizePlayers(Array.isArray(apiMyDrafted) ? apiMyDrafted : []);

      // starterPositions desde endpoint (guardamos el array)
      starterSlots = Array.isArray(result?.starterPositions)
        ? result.starterPositions.slice()
        : Array.isArray(params?.starterPositions)
          ? params.starterPositions.slice()
          : ["QB","RB","RB","WR","WR","TE","FLEX","FLEX","FLEX","K","DEF"];

      // publish dates
      if (params?.ranks_published) {
        const fecha = new Date(params.ranks_published);
        ranksUpdatedLabel.innerHTML = `<div class="px-3 py-1 small rounded-pill" style="background-color:var(--bg-secondary); color:var(--text-primary); border:1px solid var(--border);">
          <i class="bi bi-calendar-check-fill text-success"></i> Ranks: ${fecha.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</div>`;
      } else if (params?.experts_used && Array.isArray(params.experts_used) && params.experts_used.length) {
        // fallback: pick latest published from experts_used
        const lastPub = params.experts_used.map(e => new Date(e.published)).sort((a,b)=>b-a)[0];
        if (lastPub) ranksUpdatedLabel.textContent = `Ranks: ${lastPub.toLocaleString('es-MX')}`;
        else ranksUpdatedLabel.innerHTML = '';
      } else {
        ranksUpdatedLabel.innerHTML = '';
      }

      if (params?.ADPdate) {
        const adpDate = new Date(params.ADPdate);
        adpUpdatedLabel.innerHTML = `<div class="px-3 py-1 small rounded-pill" style="background-color:var(--bg-secondary); color:var(--text-primary); border:1px solid var(--border);">
          <i class="bi bi-clock-history text-warning"></i> ADP: ${adpDate.toLocaleDateString('es-MX', { dateStyle: 'medium' })}</div>`;
      } else {
        adpUpdatedLabel.innerHTML = '';
      }

      // Scoring visible en header (params.scoring)
      if (params?.scoring) {
        try {
          scoringLabel.innerHTML = `<i class="bi bi-list-check"></i> Scoring: ${escapeHtml(params.scoring)}`;
        } catch (e) { scoringLabel.textContent = `Scoring: ${params.scoring}`; }
      } else {
        scoringLabel.innerHTML = 'Scoring: —';
      }

      applyFiltersAndSort();
      renderDraftedOffcanvas();
      showSuccess('Consenso actualizado');
    } catch (err) {
      if (err && err.name === 'AbortError') {
        // aborted intentionally — do nothing
        return;
      }
      console.error('loadConsensus error', err);
      showError('Error al cargar consenso: ' + (err?.message || err));
    } finally {
      safeHideLoading();
      currentAbortController = null;
    }
  }

  // -------------------------
  // Offcanvas drafted renderer (slot-based: starters + bench)
  // -------------------------
  function renderDraftedOffcanvas() {
    const wrap = document.getElementById('drafted-list');
    const countEl = document.getElementById('drafted-count');
    if (!wrap) return;

    // copia mutable de mis drafteados
    const drafted = Array.isArray(myDrafted) ? myDrafted.slice() : [];
    countEl.textContent = String(drafted.length || 0);

    if (!drafted.length) {
      wrap.innerHTML = `<div class="text-secondary text-center py-3"><i class="bi bi-inbox"></i><div class="mt-1">Aún no tienes jugadores drafteados.</div></div>`;
      return;
    }

    // Normalizadores de posición
    const normPos = (s='') => {
      const t = String(s||'').toUpperCase().trim();
      if (!t) return '';
      if (t === 'DST' || t === 'D/ST' || t === 'DEFENSE') return 'DEF';
      if (t === 'PK' || t === 'K') return 'K';
      return t.replace('.', '').replace('/', '');
    };

    const isFlexSlot = (s='') => /FLEX|WRT|WRT|WRRBTE|WRRB|WRTE/i.test(String(s));
    const isSuperFlexSlot = (s='') => /SUPERFLEX|S-FLEX|SFLX|SF/i.test(String(s));
    const FLEX_ALLOWED = new Set(['RB','WR','TE']);
    const SUPERFLEX_ALLOWED = new Set(['QB','RB','WR','TE']);

    // Construir lista de slots a renderizar
    const rawSlots = Array.isArray(starterSlots) && starterSlots.length ? starterSlots.slice() : ["QB","RB","RB","WR","WR","TE","FLEX","FLEX","FLEX","K","DEF"];
    const counters = {};
    const slots = rawSlots.map(slot => {
      const key = isFlexSlot(slot) ? 'FLEX' : (isSuperFlexSlot(slot) ? 'SUPERFLEX' : normPos(slot));
      counters[key] = (counters[key] || 0) + 1;
      const idx = counters[key];
      const label = (key === 'FLEX' || key === 'SUPERFLEX') ? `${key}${idx}` : `${key}${(idx>1?idx:'')}`;
      return { key, label };
    });

    // funcion para sacar el primer jugador que cumpla predicado
    const takeFirst = (pred) => {
      const i = drafted.findIndex(pred);
      if (i === -1) return null;
      return drafted.splice(i,1)[0];
    };

    // inicializar starters
    const starters = slots.map(s => ({ ...s, player: null }));

    // 1) llenar slots exactos
    for (const s of starters) {
      if (s.key === 'FLEX' || s.key === 'SUPERFLEX') continue;
      s.player = takeFirst(p => normPos(p.position) === s.key);
    }

    // 2) llenar FLEX/SUPERFLEX
    for (const s of starters) {
      if (s.key !== 'FLEX' && s.key !== 'SUPERFLEX') continue;
      const allowed = s.key === 'SUPERFLEX' ? SUPERFLEX_ALLOWED : FLEX_ALLOWED;
      s.player = takeFirst(p => allowed.has(normPos(p.position)));
    }

    // restantes -> bench
    const bench = drafted;

    // helpers visuales
    const posBadgeHTML = (pos) => {
      const bg = getPositionColor(pos);
      const txt = getContrastTextColor(bg);
      return `<span class="badge" style="background:${bg};color:${txt}">${escapeHtml(pos||'')}</span>`;
    };

    const slotCardHTML = (s) => {
      if (!s.player) {
        return `
          <div class="slot-card" style="width:100%;">
            <span class="slot-badge">${escapeHtml(s.label)}</span>
            <div class="slot-empty ms-2"><i class="bi bi-dash-circle me-1"></i>Vacío</div>
          </div>`;
      }
      const p = s.player;
      return `
        <div class="slot-card" style="width:100%;">
          <span class="slot-badge">${escapeHtml(s.label)}</span>
          <div class="slot-player ms-2" style="min-width:0; flex:1 1 auto;">
            <div class="name" style="white-space:normal; overflow:visible; text-overflow:clip;">${escapeHtml(p.nombre || '')}</div>
            <div class="slot-meta">
              ${posBadgeHTML(normPos(p.position))}
              <span>${escapeHtml(p.team || '')}</span>
              <span>Bye: <span class="text-white">${escapeHtml(p.bye ?? '—')}</span></span>
            </div>
          </div>
        </div>`;
    };

    const benchItemHTML = (p) => `
      <div class="list-group-item d-flex justify-content-between align-items-center">
        <div class="min-w-0">
          <div class="fw-semibold">${escapeHtml(p.nombre || '')}</div>
          <div class="small text-secondary">
            ${posBadgeHTML(normPos(p.position))}
            <span class="ms-1">${escapeHtml(p.team || '')}</span>
            <span class="ms-2">Bye: <span class="text-white">${escapeHtml(p.bye ?? '—')}</span></span>
          </div>
        </div>
      </div>`;

    // Inyectar (forzamos 1 columna con inline style para anular el CSS responsive previo)
    wrap.innerHTML = `
      <div class="lineup-section">
        <div class="d-flex align-items-center gap-2 mb-2">
          <i class="bi bi-play-fill text-success"></i>
          <span class="lineup-section-title">Titulares</span>
        </div>
        <div class="lineup-grid" style="grid-template-columns: 1fr;">
          ${starters.map(slotCardHTML).join('')}
        </div>
      </div>

      <div class="lineup-section mt-3">
        <div class="d-flex align-items-center justify-content-between mb-2">
          <div class="d-flex align-items-center gap-2">
            <i class="bi bi-collection"></i>
            <span class="lineup-section-title">Banca</span>
          </div>
          <span class="badge bg-secondary">${bench.length}</span>
        </div>
        <div class="bench-list list-group list-group-flush">
          ${bench.length ? bench.map(benchItemHTML).join('') :
            `<div class="text-secondary text-center py-3">
              <i class="bi bi-inbox"></i><div class="mt-1">Sin jugadores en la banca.</div>
            </div>`}
        </div>
      </div>
    `;
  }

  // -------------------------
  // Events (debounced where needed)
  // -------------------------
  statusSelect.addEventListener('change', () => { try{ localStorage.setItem('consensusStatus', statusSelect.value); }catch{} applyFiltersAndSort(); });
  positionSelect.addEventListener('change', () => { try{ localStorage.setItem('consensusPosition', positionSelect.value); }catch{} applyFiltersAndSort(); });
  byeInput.addEventListener('input', debounce(() => applyFiltersAndSort(), 200));
  sleeperADPCheckbox.addEventListener('change', () => { try{ localStorage.setItem('consensusSleeperADP', sleeperADPCheckbox.checked); }catch{} loadConsensus(); });

  pageSizeSel.addEventListener('change', () => { pageSize = Number(pageSizeSel.value) || 12; currentPage = 1; renderPlayersGrid(); renderPagination(); });
  sortBySel.addEventListener('change', () => { applyFiltersAndSort(); });
  sortDirSel.addEventListener('change', () => { applyFiltersAndSort(); });

  searchInput.addEventListener('input', debounce((e) => { searchQuery = e.target.value || ''; currentPage = 1; applyFiltersAndSort(); }, 250));

  btnRefresh.addEventListener('click', () => loadConsensus());
  btnOpenDrafted?.addEventListener('click', () => renderDraftedOffcanvas());

  // initialize league select
  let leagueTS = null;
  try {
    leagueTS = await renderLeagueSelect('#select-league', {
      plugins: ['dropdown_input'],
      dropdownInput: false,
      create: false,
      persist: false,
      onChange() {
        // evitar trigger en init
        if (!leagueSelectInitialized) return;
        try { localStorage.setItem('consensusLeague', this.getValue?.() || ''); } catch(e) {}
        if (this && typeof this.blur === 'function') this.blur();
        loadConsensus();
      }
    });
  } catch (e) {
    await renderLeagueSelect('#select-league', { plugins: ['dropdown_input'], dropdownInput: false, create: false, persist: false });
  }
  if (!leagueTS && document.querySelector('#select-league')?.tomselect) leagueTS = document.querySelector('#select-league').tomselect;

  // apply saved league but avoid triggering onChange automatic load
  try {
    const url = new URL(window.location.href);
    const qLeague = url.searchParams.get('leagueId');
    const savedLeague = localStorage.getItem('consensusLeague') || qLeague || '';
    if (savedLeague) {
      if (leagueTS && typeof leagueTS.setValue === 'function') {
        leagueTS.setValue(savedLeague);
        leagueTS.blur?.();
      } else if (leagueSelect) {
        leagueSelect.value = savedLeague;
        leagueSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  } catch (e) {}

  // allow onChange to run ahora
  leagueSelectInitialized = true;

  // initial render
  filtered = [];
  renderPlayersGrid();
  renderPagination();

  // if league exists, load once
  const initialLeague = (document.querySelector('#select-league')?.tomselect?.getValue?.() || leagueSelect.value || '').toString().trim();
  if (initialLeague) await loadConsensus();

  // close stale Swal on unload (safety)
  window.addEventListener('beforeunload', () => { try { Swal.close(); } catch(e){} });

  // ensure offcanvas re-renders drafted list when opened
  try {
    const off = document.getElementById('offcanvasDrafted');
    if (off) {
      off.addEventListener('show.bs.offcanvas', () => renderDraftedOffcanvas());
    }
  } catch(e){}
}
