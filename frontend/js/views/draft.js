// frontend/src/views/consensusDraft.js
import { showSuccess, showError } from '../../../components/alerts.js';
import { getAccessTokenFromClient } from '../../../components/authHelpers.js';

// === Config ===
const API_BASE = 'https://fantasy-nfl-backend.onrender.com';
const DRAFT_API_PATH = '/draft/consensus';

// === State ===
let STATE = {
  leagueId: null,
  position: 'ALL',
  search: '',
  sortBy: 'avg_rank',
  sortDir: 'asc',
  loading: false,
  players: [],
  myDrafted: [],
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
  switch ((pos || '').toUpperCase()) {
    case 'QB': return 'bg-warning text-dark';
    case 'RB': return 'bg-success';
    case 'WR': return 'bg-primary';
    case 'TE': return 'bg-info text-dark';
    case 'K': return 'bg-secondary';
    case 'DST': return 'bg-dark';
    default: return 'bg-secondary';
  }
}

function formatNum(n, dec = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v.toFixed(dec) : '—';
}

// === Fetch ===
async function fetchConsensusDraft({ leagueId, position = 'ALL' }) {
  try {
    STATE.loading = true;
    renderLoading(true);

    const token = await getAccessTokenFromClient().catch(() => null);
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    const qs = new URLSearchParams({ leagueId, position });
    const url = `${API_BASE}${DRAFT_API_PATH}?${qs.toString()}`;
    const res = await fetch(url, { headers });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text || 'No se pudo obtener el consenso');
    }

    const payload = await res.json();
    STATE.players = Array.isArray(payload?.data?.players) ? payload.data.players : [];
    STATE.myDrafted = Array.isArray(payload?.data?.my_drafted) ? payload.data.my_drafted : [];
  } catch (err) {
    console.error('fetchConsensusDraft error:', err);
    showError('Error al cargar jugadores: ' + (err.message || err));
  } finally {
    STATE.loading = false;
    renderAll();
  }
}

// === Filters / Sorting ===
const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DST'];

function getVisiblePlayers() {
  const term = STATE.search.trim().toLowerCase();
  let list = STATE.players.slice();

  if (STATE.position !== 'ALL') {
    list = list.filter(p => (p.position || '').toUpperCase() === STATE.position);
  }

  if (term) {
    list = list.filter(p => {
      const name = (p.nombre || '').toLowerCase();
      const team = (p.team || '').toLowerCase();
      const pos = (p.position || '').toLowerCase();
      return name.includes(term) || team.includes(term) || pos.includes(term);
    });
  }

  const key = STATE.sortBy;
  const dir = STATE.sortDir === 'asc' ? 1 : -1;

  return list.sort((a, b) => {
    const va = a?.[key], vb = b?.[key];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;

    const aa = a?.adp_rank ?? Infinity;
    const bb = b?.adp_rank ?? Infinity;
    return (aa - bb) * dir;
  });
}

// === Render ===
function loadStyles() {
  if (!document.querySelector('link[data-style="draft-consensus"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '../../css/draft-consensus.css';
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
      <div class="col-12 col-lg-6">
        <div class="d-flex flex-wrap gap-2">
          ${POSITIONS.map(p => `
            <button type="button"
              class="btn btn-sm ${STATE.position === p ? 'btn-primary' : 'btn-outline-light'} pos-chip"
              data-pos="${p}">
              ${p}
            </button>
          `).join('')}
        </div>
      </div>

      <div class="col-12 col-lg-3">
        <input id="draft-search" class="form-control" placeholder="Buscar..." value="${escapeHtml(STATE.search)}" />
      </div>

      <div class="col-6 col-lg-1">
        <select id="draft-sort-by" class="form-select">
          <option value="avg_rank" ${STATE.sortBy === 'avg_rank' ? 'selected' : ''}>Avg Rank</option>
          <option value="adp_rank" ${STATE.sortBy === 'adp_rank' ? 'selected' : ''}>ADP Rank</option>
          <option value="valueOverADP" ${STATE.sortBy === 'valueOverADP' ? 'selected' : ''}>Val/ADP</option>
        </select>
      </div>

      <div class="col-6 col-lg-1">
        <select id="draft-sort-dir" class="form-select">
          <option value="asc" ${STATE.sortDir === 'asc' ? 'selected' : ''}>Asc</option>
          <option value="desc" ${STATE.sortDir === 'desc' ? 'selected' : ''}>Desc</option>
        </select>
      </div>
    </div>
  `;

  // Bindings
  document.querySelectorAll('.pos-chip').forEach(btn => {
    btn.addEventListener('click', async () => {
      STATE.position = btn.dataset.pos;
      await fetchConsensusDraft({ leagueId: STATE.leagueId, position: STATE.position });
    });
  });

  document.getElementById('draft-search').addEventListener('input', (e) => {
    STATE.search = e.target.value || '';
    renderPlayersGrid();
  });
  document.getElementById('draft-sort-by').addEventListener('change', (e) => { STATE.sortBy = e.target.value; renderPlayersGrid(); });
  document.getElementById('draft-sort-dir').addEventListener('change', (e) => { STATE.sortDir = e.target.value; renderPlayersGrid(); });
  document.getElementById('btn-refresh-draft').addEventListener('click', async () => {
    await fetchConsensusDraft({ leagueId: STATE.leagueId, position: STATE.position });
    showSuccess('Lista actualizada');
  });
  document.getElementById('btn-open-drafted').addEventListener('click', () => renderDraftedOffcanvas());
}

function iconFlags(p) {
  const out = [];
  if (p?.rookie) out.push('<span class="badge bg-dark-subtle text-white border">R</span>');
  if (p?.goodOffense) out.push('<span title="Buena ofensiva">✔️</span>');
  if (p?.byeFound) out.push('<span title="Coincide bye con tu equipo">👋</span>');
  if (p?.teamFound) out.push('<span title="Mismo equipo">🏈</span>');
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
    const statusBadge = p.status === 'LIBRE'
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
              <div class="text-end">${statusBadge}</div>
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
    wrap.innerHTML = `<div class="text-secondary text-center py-3"><i class="bi bi-inbox"></i><div class="mt-1">Aún no tienes jugadores drafteados.</div></div>`;
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
  if (!content) return showError('No se encontró el contenedor de contenido.');

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
              </div>`).join('')}
          </div>
        </div>
        <div id="draft-grid" class="row g-3"></div>
        <div id="draft-empty" class="text-center text-secondary py-4 d-none">
          <i class="bi bi-inbox"></i>
          <div class="mt-2">No hay jugadores que coincidan con los filtros.</div>
        </div>
      </div>
    </div>

    <div class="offcanvas offcanvas-end flock-offcanvas" tabindex="-1" id="offcanvasDrafted">
      <div class="offcanvas-header border-secondary">
        <h5 class="offcanvas-title d-flex align-items-center gap-2">
          <i class="bi bi-people-fill text-flock"></i> Mi equipo · <span id="drafted-count" class="badge bg-primary">0</span>
        </h5>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="offcanvas"></button>
      </div>
      <div class="offcanvas-body"><div id="drafted-list"></div></div>
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
  STATE.leagueId = getQueryParam('leagueId', '');
  if (!STATE.leagueId) return showError('Falta leagueId en la URL (?leagueId=...)');

  renderChrome();
  renderControls();
  renderLoading(true);
  await fetchConsensusDraft({ leagueId: STATE.leagueId, position: STATE.position });
}
