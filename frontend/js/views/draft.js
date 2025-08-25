// frontend/src/views/consensusDraft.js (REWRITE)
// Estructura visual basada en la primera vista, pero usando filtros de la segunda vista.
// IMPORTANTES:
//  - No se envía idExperto al backend.
//  - Se usa fetchConsensusData (nueva función en api.js) con: leagueId, position, byeCondition, sleeperADP.
//  - Filtros locales: status (LIBRE/TODOS), búsqueda, sort, position chips.

import { showSuccess, showError } from '../../../components/alerts.js';
import { positions } from '../../../components/constants.js';
import { fetchConsensusData } from '../api.js';

// === State ===
let STATE = {
  leagueId: null,
  position: 'ALL',          // UI chips (ALL|QB|RB|WR|TE|K|DST). En request se mapea a 'TODAS' o a la posición.
  search: '',
  sortBy: 'avg_rank',       // avg_rank | adp_rank | valueOverADP
  sortDir: 'asc',           // asc | desc
  loading: false,
  players: [],
  myDrafted: [],            // sin backend por ahora (queda vacío)
  status: 'LIBRE',          // LIBRE | TODOS (filtro local)
  byeCondition: 0,          // número; se envía al backend
  sleeperADP: false,        // boolean; se envía al backend
};

// === Utils ===
function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
function getQueryParam(name, fallback = null) {
  const url = new URL(window.location.href);
  return url.searchParams.get(name) ?? fallback;
}
function badgeClassForPos(pos) {
  const p = String(pos || '').toUpperCase();
  if (p === 'QB') return 'bg-warning text-dark';
  if (p === 'RB') return 'bg-success';
  if (p === 'WR') return 'bg-primary';
  if (p === 'TE') return 'bg-info text-dark';
  if (p === 'K') return 'bg-secondary';
  if (p === 'DST') return 'bg-dark';
  return 'bg-secondary';
}
function formatNum(n, dec = 0) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return v.toFixed(dec);
}
function debounce(fn, wait = 250) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn.apply(null, args), wait); };
}

// === Persistencia simple ===
const LS_KEYS = {
  status: 'consensusStatus',
  sleeper: 'consensusSleeperADP',
  position: 'consensusPosition',
  sortBy: 'consensusSortBy',
  sortDir: 'consensusSortDir',
  search: 'consensusSearch',
  bye: 'consensusBye',
};

function saveLS(k, v) { try { localStorage.setItem(k, String(v)); } catch {} }
function readLS(k, def) { try { const v = localStorage.getItem(k); return v ?? def; } catch { return def; } }

// === Fetch data ===
async function loadConsensus() {
  try {
    STATE.loading = true;
    renderLoading(true);

    // Mapeo de posición: UI 'ALL' => backend espera 'TODAS'
    const positionParam = STATE.position === 'ALL' ? 'TODAS' : STATE.position;
    const byeCondition = Number(STATE.byeCondition) || 0; // <-- asegura que exista
    const sleeperADP = !!STATE.sleeperADP;

    const { players, params } = await fetchConsensusData(
      STATE.leagueId,
      positionParam,
      byeCondition,
      sleeperADP,
    );

    STATE.players = Array.isArray(players) ? players : [];

    // (Opcional) si tu backend llegara a mandar my_drafted como en la 1a vista, mantenlo
    // STATE.myDrafted = Array.isArray(payload?.data?.my_drafted) ? payload.data.my_drafted : [];
  } catch (err) {
    console.error('loadConsensus error', err);
    showError('Error al cargar consenso: ' + (err?.message || err));
  } finally {
    STATE.loading = false;
    renderAll();
  }
}

// === Filtros / sorting ===
const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DST'];

function getVisiblePlayers() {
  const term = STATE.search.trim().toLowerCase();
  let list = STATE.players.slice();

  // Filtro por posición (ya viene filtrado por backend, pero mantenemos por seguridad)
  if (STATE.position && STATE.position !== 'ALL') {
    list = list.filter(p => (String(p.position || '').toUpperCase() === STATE.position));
  }

  // Filtro por STATUS (local)
  if (STATE.status && STATE.status !== 'TODOS') {
    list = list.filter(p => (String(p.status || '').toUpperCase() === 'LIBRE'));
  }

  // Filtro por texto
  if (term) {
    list = list.filter(p => {
      const name = String(p.nombre || '').toLowerCase();
      const team = String(p.team || '').toLowerCase();
      const pos = String(p.position || '').toLowerCase();
      const tags = [p.valueTag, p.tier_global_label, p.tier_pos_label, ...(p.riskTags || [])]
        .filter(Boolean).join(' ').toLowerCase();
      return name.includes(term) || team.includes(term) || pos.includes(term) || tags.includes(term);
    });
  }

  // Orden
  const key = STATE.sortBy;
  const dir = STATE.sortDir === 'asc' ? 1 : -1;

  list.sort((a, b) => {
    const va = a?.[key];
    const vb = b?.[key];

    // nulls al final
    const aNull = (va === null || va === undefined);
    const bNull = (vb === null || vb === undefined);
    if (aNull && bNull) return 0;
    if (aNull) return 1;
    if (bNull) return -1;

    if (va < vb) return -1 * dir;
    if (va > vb) return  1 * dir;
    // desempata con adp_rank si existe
    const aa = a?.adp_rank ?? Number.POSITIVE_INFINITY;
    const bb = b?.adp_rank ?? Number.POSITIVE_INFINITY;
    if (aa < bb) return -1 * dir;
    if (aa > bb) return  1 * dir;
    return 0;
  });

  return list;
}

// === Render ===
function loadStyles() {
  if (!document.querySelector('link[data-style="draft-consensus"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '../../css/draft-consensus.css'; // opcional
    link.dataset.style = 'draft-consensus';
    document.head.appendChild(link);
  }
}

function renderLoading(show) {
  const grid = document.getElementById('draft-grid');
  const empty = document.getElementById('draft-empty');
  const sk = document.getElementById('draft-skeleton');
  if (!grid || !sk || !empty) return;

  if (show) {
    grid.innerHTML = '';
    empty.classList.add('d-none');
    sk.classList.remove('d-none');
  } else {
    sk.classList.add('d-none');
  }
}

function renderControls() {
  const wrap = document.getElementById('draft-controls');
  if (!wrap) return;

  const savedStatus = readLS(LS_KEYS.status, STATE.status);
  const savedSleeper = readLS(LS_KEYS.sleeper, String(STATE.sleeperADP)) === 'true';
  const savedSearch = readLS(LS_KEYS.search, STATE.search);
  const savedSortBy = readLS(LS_KEYS.sortBy, STATE.sortBy);
  const savedSortDir = readLS(LS_KEYS.sortDir, STATE.sortDir);
  const savedBye = Number(readLS(LS_KEYS.bye, String(STATE.byeCondition))) || 0;
  const savedPos = readLS(LS_KEYS.position, STATE.position);

  // sincroniza STATE con LS (una vez por render inicial)
  STATE.status = savedStatus;
  STATE.sleeperADP = savedSleeper;
  STATE.search = savedSearch;
  STATE.sortBy = savedSortBy;
  STATE.sortDir = savedSortDir;
  STATE.byeCondition = savedBye;
  STATE.position = savedPos;

  wrap.innerHTML = `
    <div class="d-flex flex-wrap gap-2 align-items-center justify-content-between">
      <div class="d-flex flex-wrap align-items-center gap-2">
        <h4 class="m-0 d-flex align-items-center gap-2">
          <i class="bi bi-list-stars text-warning"></i> Draft – Consenso
        </h4>
        <span class="text-secondary small">League ID: <span class="text-white">${escapeHtml(STATE.leagueId || '-')}</span></span>
      </div>

      <div class="d-flex flex-wrap gap-2">
        <button id="btn-refresh-draft" type="button" class="btn btn-sm btn-outline-light">
          <i class="bi bi-arrow-clockwise"></i> Actualizar
        </button>
        <button id="btn-open-drafted" type="button" class="btn btn-sm btn-accent" data-bs-toggle="offcanvas" data-bs-target="#offcanvasDrafted">
          <i class="bi bi-people-fill"></i> Mi equipo (${STATE.myDrafted?.length || 0})
        </button>
      </div>
    </div>

    <div class="row g-2 mt-2">
      <div class="col-12 col-xl-6">
        <div class="d-flex flex-wrap gap-2">
          ${POSITIONS.map(p => `
            <button type="button"
              class="btn btn-sm ${STATE.position === p ? 'btn-primary' : 'btn-outline-light'} pos-chip"
              data-pos="${p}">
              ${p.replace('_', ' ')}
            </button>
          `).join('')}
        </div>
      </div>

      <div class="col-12 col-sm-6 col-md-3 col-xl-2">
        <input id="draft-search" class="form-control" placeholder="Buscar por nombre, equipo o posición..." value="${escapeHtml(STATE.search)}" />
      </div>

      <div class="col-6 col-md-2 col-xl-1">
        <select id="draft-sort-by" class="form-select">
          <option value="avg_rank" ${STATE.sortBy === 'avg_rank' ? 'selected' : ''}>Avg Rank</option>
          <option value="adp_rank" ${STATE.sortBy === 'adp_rank' ? 'selected' : ''}>ADP Rank</option>
          <option value="valueOverADP" ${STATE.sortBy === 'valueOverADP' ? 'selected' : ''}>Value/ADP</option>
        </select>
      </div>

      <div class="col-6 col-md-2 col-xl-1">
        <select id="draft-sort-dir" class="form-select">
          <option value="asc" ${STATE.sortDir === 'asc' ? 'selected' : ''}>Asc</option>
          <option value="desc" ${STATE.sortDir === 'desc' ? 'selected' : ''}>Desc</option>
        </select>
      </div>

      <!-- Filtros extra de la segunda vista -->
      <div class="col-6 col-md-2 col-xl-1">
        <select id="select-status" class="form-select">
          <option value="LIBRE" ${STATE.status === 'LIBRE' ? 'selected' : ''}>LIBRE</option>
          <option value="TODOS" ${STATE.status === 'TODOS' ? 'selected' : ''}>TODOS</option>
        </select>
      </div>

      <div class="col-6 col-md-2 col-xl-1">
        <input id="input-bye" type="number" min="0" step="1" class="form-control" placeholder="Bye ≤" value="${Number(STATE.byeCondition) || 0}" />
      </div>

      <div class="col-12 col-md-3 col-xl-2 d-flex align-items-center">
        <div class="form-check">
          <input class="form-check-input" type="checkbox" id="chk-sleeperADP" ${STATE.sleeperADP ? 'checked' : ''} />
          <label class="form-check-label" for="chk-sleeperADP">Sleeper ADP</label>
        </div>
      </div>
    </div>
  `;

  // Bind chips
  document.querySelectorAll('.pos-chip').forEach(btn => {
    btn.addEventListener('click', async () => {
      STATE.position = btn.dataset.pos;
      saveLS(LS_KEYS.position, STATE.position);
      await loadConsensus();
    });
  });

  // Bind búsqueda
  document.getElementById('draft-search').addEventListener('input', (e) => {
    STATE.search = e.target.value || '';
    saveLS(LS_KEYS.search, STATE.search);
    renderPlayersGrid();
  });

  // Bind orden
  document.getElementById('draft-sort-by').addEventListener('change', (e) => {
    STATE.sortBy = e.target.value;
    saveLS(LS_KEYS.sortBy, STATE.sortBy);
    renderPlayersGrid();
  });
  document.getElementById('draft-sort-dir').addEventListener('change', (e) => {
    STATE.sortDir = e.target.value;
    saveLS(LS_KEYS.sortDir, STATE.sortDir);
    renderPlayersGrid();
  });

  // Botones header
  document.getElementById('btn-refresh-draft').addEventListener('click', async () => {
    await loadConsensus();
    showSuccess('Lista actualizada');
  });
  document.getElementById('btn-open-drafted').addEventListener('click', () => {
    renderDraftedOffcanvas();
  });

  // Filtros extra
  const statusSel = document.getElementById('select-status');
  const byeInp = document.getElementById('input-bye');
  const sleeperChk = document.getElementById('chk-sleeperADP');

  statusSel.addEventListener('change', () => {
    STATE.status = statusSel.value || 'LIBRE';
    saveLS(LS_KEYS.status, STATE.status);
    renderPlayersGrid();
  });

  byeInp.addEventListener('input', debounce(() => {
    const v = Number(byeInp.value) || 0;
    STATE.byeCondition = v;
    saveLS(LS_KEYS.bye, v);
    loadConsensus();
  }, 300));

  sleeperChk.addEventListener('change', () => {
    STATE.sleeperADP = !!sleeperChk.checked;
    saveLS(LS_KEYS.sleeper, STATE.sleeperADP);
    loadConsensus();
  });
}

function iconFlags(p) {
  const out = [];
  if (p?.rookie) out.push('<span class="badge bg-dark-subtle text-white border">R</span>');
  if (p?.goodOffense) out.push('<span title="Buena ofensiva">✔️</span>');
  if (p?.byeFound) out.push('<span title="Coincide bye con tu equipo">👋</span>');
  if (p?.teamFound) out.push('<span title="Mismo equipo que ya tienes">🏈</span>');
  if (p?.byeConflict) out.push('<span title="Bye conflictivo">🚫</span>');
  return out.join(' ');
}

function renderPlayersGrid() {
  const grid = document.getElementById('draft-grid');
  const empty = document.getElementById('draft-empty');
  if (!grid) return;

  const list = getVisiblePlayers();
  if (!list.length) {
    grid.innerHTML = '';
    empty.classList.remove('d-none');
    return;
  }
  empty.classList.add('d-none');

  grid.innerHTML = list.map(p => {
    const posBadge = `<span class="badge ${badgeClassForPos(p.position)}">${escapeHtml(p.position || 'UNK')}</span>`;
    const statusBadge = String(p.status || '').toUpperCase() === 'LIBRE'
      ? '<span class="badge bg-success">LIBRE</span>'
      : '<span class="badge bg-secondary">Tomado</span>';

    return `
      <div class="col-12 col-md-6 col-lg-4">
        <div class="card h-100 border border-secondary draft-card">
          <div class="card-body d-flex flex-column">
            <div class="d-flex justify-content-between align-items-start">
              <div class="min-w-0">
                <h5 class="card-title m-0 text-truncate">${escapeHtml(p.nombre || '')}</h5>
                <div class="small text-secondary">
                  ${posBadge}
                  <span class="ms-1">${escapeHtml(p.team || 'UNK')}</span>
                  <span class="ms-2">Bye: <span class="text-white">${escapeHtml(p.bye ?? '—')}</span></span>
                </div>
              </div>
              <div class="text-end">
                ${statusBadge}
              </div>
            </div>

            <div class="mt-2 d-flex flex-wrap gap-2 align-items-center small">
              <span class="badge bg-primary">Avg: ${formatNum(p.avg_rank)}</span>
              <span class="badge bg-info text-dark">ADP: ${formatNum(p.adp_rank)}</span>
              <span class="badge bg-warning text-dark">Val/ADP: ${formatNum(p.valueOverADP, 2)}</span>
              <span class="ms-auto d-flex align-items-center gap-2">${iconFlags(p)}</span>
            </div>

            <div class="mt-auto d-flex gap-2">
              <button type="button" class="btn btn-sm btn-outline-light w-100" data-action="detail" data-id="${escapeHtml(p.player_id)}">
                <i class="bi bi-zoom-in"></i> Detalles
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Delegación para acciones en cards
  grid.querySelectorAll('[data-action="detail"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const pid = btn.dataset.id;
      const player = STATE.players.find(x => String(x.player_id) === String(pid));
      if (!player) return;
      showSuccess(`${player.nombre} · ${player.team} · ${player.position} (Bye ${player.bye})`);
    });
  });
}

function renderDraftedOffcanvas() {
  const wrap = document.getElementById('drafted-list');
  const countEl = document.getElementById('drafted-count');
  if (!wrap) return;

  const list = STATE.myDrafted || [];
  countEl.textContent = String(list.length);

  if (!list.length) {
    wrap.innerHTML = `
      <div class="text-secondary text-center py-3">
        <i class="bi bi-inbox"></i>
        <div class="mt-1">Aún no tienes jugadores drafteados.</div>
      </div>
    `;
    return;
  }

  wrap.innerHTML = `
    <div class="list-group list-group-flush">
      ${list.map(p => `
        <div class="list-group-item bg-transparent text-white d-flex justify-content-between align-items-center">
          <div class="min-w-0">
            <div class="fw-semibold text-truncate">${escapeHtml(p.nombre || '')}</div>
            <div class="small text-secondary">
              <span class="badge ${badgeClassForPos(p.position)}">${escapeHtml(p.position || 'UNK')}</span>
              <span class="ms-1">${escapeHtml(p.team || 'UNK')}</span>
              <span class="ms-2">Bye: <span class="text-white">${escapeHtml(p.bye ?? '—')}</span></span>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderChrome() {
  const content = document.getElementById('content-container');
  if (!content) {
    showError('No se encontró el contenedor de contenido.');
    return;
  }

  content.innerHTML = `
    <div class="card border-0 shadow-sm rounded flock-card h-100">
      <div class="card-body d-flex flex-column min-h-0">
        <div id="draft-controls" class="mb-3"></div>

        <div id="draft-skeleton" class="d-none">
          <div class="row g-3">
            ${Array.from({ length: 9 }).map(() => `
              <div class="col-12 col-md-6 col-lg-4">
                <div class="placeholder-glow">
                  <div class="placeholder col-12" style="height: 140px;"></div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <div id="draft-grid" class="row g-3"></div>
        <div id="draft-empty" class="text-center text-secondary py-4 d-none">
          <i class="bi bi-inbox"></i>
          <div class="mt-2">No hay jugadores que coincidan con los filtros.</div>
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
}

function renderAll() {
  renderControls();
  renderPlayersGrid();
  renderDraftedOffcanvas();
  renderLoading(false);
}

// === Entry point ===
export default async function renderConsensusDraft() {
  loadStyles();

  // leagueId desde querystring: ?leagueId=...
  STATE.leagueId = getQueryParam('leagueId', '');
  if (!STATE.leagueId) {
    showError('Falta leagueId en la URL (?leagueId=...)');
    return;
  }

  // Restaurar algunos valores útiles de LS antes de la primera carga
  STATE.position = readLS(LS_KEYS.position, STATE.position);
  STATE.status = readLS(LS_KEYS.status, STATE.status);
  STATE.sleeperADP = (readLS(LS_KEYS.sleeper, String(STATE.sleeperADP)) === 'true');
  STATE.search = readLS(LS_KEYS.search, STATE.search);
  STATE.sortBy = readLS(LS_KEYS.sortBy, STATE.sortBy);
  STATE.sortDir = readLS(LS_KEYS.sortDir, STATE.sortDir);
  STATE.byeCondition = Number(readLS(LS_KEYS.bye, String(STATE.byeCondition))) || 0;

  renderChrome();
  renderControls();    // render inicial
  renderLoading(true); // skeleton mientras trae

  await loadConsensus();
}
