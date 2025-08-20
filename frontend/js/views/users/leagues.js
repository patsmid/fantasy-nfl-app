import {
  fetchManualLeaguesByUser,
  insertManualLeague,
  deleteManualLeague,
  setLeagueUser, // opcional
} from '../../apiUsers.js';

import { showSuccess, showError, showConfirm } from '../../../components/alerts.js';
import { getAccessTokenFromClient, getUserIdFromClient } from '../../../components/authHelpers.js';

// Host backend (ajusta si tu variable global es otra)
const API_BASE = 'https://fantasy-nfl-backend.onrender.com';

/* ===============================
   Helpers para league_settings (con token si está disponible)
   =============================== */
async function fetchLeagueSettings(league_id) {
  try {
    const token = await getAccessTokenFromClient().catch(() => null);
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(`${API_BASE}/manual/league-settings/${encodeURIComponent(league_id)}`, { headers });
    if (!res.ok) throw new Error('No se pudo obtener league_settings');
    const { data } = await res.json();
    return data || null;
  } catch (err) {
    console.warn('fetchLeagueSettings error:', err);
    return null;
  }
}

async function upsertLeagueSettings(league_id, payload) {
  const token = await getAccessTokenFromClient().catch(() => null);
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const res = await fetch(`${API_BASE}/manual/league-settings/${encodeURIComponent(league_id)}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || 'No se pudo guardar league_settings');
  }
  const { data } = await res.json();
  return data;
}

/* ===============================
   Presets / Plantillas
   =============================== */
const LINEUP_PRESETS = {
  STANDARD: {
    label: 'Standard',
    sp: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DST: 1 },
  },
  HALF_PPR: {
    label: 'Half-PPR',
    sp: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DST: 1 },
  },
  PPR: {
    label: 'PPR',
    sp: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DST: 1 },
  },
  SUPERFLEX: {
    label: 'Superflex',
    sp: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPER_FLEX: 1, K: 0, DST: 1 },
  },
  TE_PREMIUM: {
    label: 'TE-Premium',
    sp: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DST: 1 },
  },
};

const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPER_FLEX', 'K', 'DST', 'DL', 'LB', 'DB'];

let STATE = {
  leagues: [],
  viewMode: 'table',
  currentLeague: null,
  currentSettings: null,
  dirty: false,
};

/* ===============================
   Pequeños helpers UI / UX
   =============================== */
function booleanBadge(val) {
  if (val === true) return '<span class="badge bg-success">Sí</span>';
  if (val === false) return '<span class="badge bg-danger">No</span>';
  return '<span class="badge bg-secondary">--</span>';
}

function escapeHtml(str) {
  return String(str || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/* Normaliza distintos shapes de showConfirm */
async function confirmDialog(message) {
  try {
    const result = await showConfirm(typeof message === 'string' ? { text: message } : message);
    if (typeof result === 'boolean') return result;
    if (result && (result.isConfirmed !== undefined)) return result.isConfirmed;
    // some implementations return { confirmed: true }
    if (result && (result.confirmed !== undefined)) return result.confirmed;
    return Boolean(result);
  } catch (err) {
    // fallback to window.confirm
    return confirm(typeof message === 'string' ? message : (message?.text || '¿Confirmar?'));
  }
}

/* ===============================
   Cargar estilos exclusivos para esta vista
   =============================== */
function loadLeagueStyles() {
  if (!document.querySelector('link[data-style="leagues"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '../../css/leagues.css'; // ajusta ruta si es necesario
    link.dataset.style = 'leagues';
    document.head.appendChild(link);
  }
}

/* ===============================
   Export default: renderiza la vista
   =============================== */
export default async function renderManualLeagues() {
  loadLeagueStyles();

  const content = document.getElementById('content-container');
  if (!content) {
    showError('No se encontró el contenedor de contenido.');
    return;
  }

  content.innerHTML = `
    <div class="card border-0 shadow-sm rounded flock-card">
      <div class="card-body">
        <div class="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-4">
          <div class="d-flex align-items-center gap-2">
            <h4 class="m-0 d-flex align-items-center gap-2">
              <i class="bi bi-pencil-square text-warning"></i> Ligas Manuales
            </h4>
            <span class="text-secondary small">Administra tus ligas, presets y titulares</span>
          </div>
          <div class="d-flex flex-wrap gap-2">
            <div class="btn-group btn-group-sm" role="group" aria-label="Vista">
              <button class="btn btn-outline-light ${STATE.viewMode === 'table' ? 'active' : ''}" id="btn-view-table" title="Tabla">
                <i class="bi bi-table"></i>
              </button>
              <button class="btn btn-outline-light ${STATE.viewMode === 'cards' ? 'active' : ''}" id="btn-view-cards" title="Tarjetas">
                <i class="bi bi-grid-3x3-gap"></i>
              </button>
            </div>
            <button class="btn btn-sm btn-success d-flex align-items-center gap-2" id="btn-add-league" type="button">
              <i class="bi bi-plus-circle"></i> Nueva Liga
            </button>
          </div>
        </div>

        <div class="row g-2 mb-3">
          <div class="col-12 col-md-6">
            <input id="league-search" class="form-control" placeholder="Buscar liga por nombre o ID..." />
          </div>
        </div>

        <div class="table-responsive ${STATE.viewMode === 'table' ? '' : 'd-none'}" id="wrap-table">
          <table id="manualLeaguesTable" class="table table-dark table-hover align-middle w-100">
            <thead class="table-dark text-uppercase text-secondary small">
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>League ID</th>
                <th>Dynasty</th>
                <th>BestBall</th>
                <th>Draft ID</th>
                <th>Rosters</th>
                <th>Status</th>
                <th class="text-center">Acciones</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>

        <div id="wrap-cards" class="${STATE.viewMode === 'cards' ? '' : 'd-none'}">
          <div id="cards-grid" class="row g-3"></div>
        </div>
      </div>
    </div>

    <!-- Modal: Nueva Liga -->
    <div class="modal fade" id="modalAddLeague" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content bg-dark text-white">
          <div class="modal-header border-secondary">
            <h5 class="modal-title">Agregar Liga Manual</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <form id="formAddLeague" class="row g-3">
              <div class="col-12">
                <label class="form-label">Nombre</label>
                <input type="text" class="form-control" name="name" required>
              </div>
              <div class="col-6">
                <label class="form-label">Draft ID</label>
                <input type="text" class="form-control" name="draft_id">
              </div>
              <div class="col-6">
                <label class="form-label">Rosters</label>
                <input type="number" min="0" class="form-control" name="total_rosters">
              </div>
              <div class="col-6">
                <label class="form-label">Dynasty</label>
                <select name="dynasty" class="form-select">
                  <option value="">--</option>
                  <option value="true">Sí</option>
                  <option value="false">No</option>
                </select>
              </div>
              <div class="col-6">
                <label class="form-label">BestBall</label>
                <select name="bestball" class="form-select">
                  <option value="">--</option>
                  <option value="true">Sí</option>
                  <option value="false">No</option>
                </select>
              </div>
              <div class="col-12">
                <label class="form-label">Status</label>
                <input type="text" class="form-control" name="status" placeholder="pre_draft / in_draft / post_draft ...">
              </div>
            </form>
          </div>
          <div class="modal-footer border-secondary">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="submit" form="formAddLeague" class="btn btn-success">Guardar</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Offcanvas: Configurar Titulares -->
    <div class="offcanvas offcanvas-end flock-offcanvas" tabindex="-1" id="offcanvasStarters">
      <div class="offcanvas-header border-secondary">
        <div>
          <h5 class="offcanvas-title d-flex align-items-center gap-2">
            <i class="bi bi-people-fill text-flock"></i>
            <span id="oc-league-name">Titulares</span>
          </h5>
          <div class="small text-secondary" id="oc-league-meta"></div>
        </div>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="offcanvas" aria-label="Close"></button>
      </div>
      <div class="offcanvas-body">
        <div class="mb-3">
          <div class="d-flex flex-wrap gap-2">
            ${Object.entries(LINEUP_PRESETS).map(([key, p]) => `
              <button type="button" class="btn btn-sm btn-outline-light preset-chip" data-preset="${key}">
                ${p.label}
              </button>
            `).join('')}
            <button type="button" class="btn btn-sm btn-accent" id="btn-preset-custom">
              <i class="bi bi-sliders"></i> Personalizado
            </button>
          </div>
        </div>

        <div id="pos-controls" class="row g-2"></div>

        <div class="mt-3 p-2 rounded bg-dark-subtle border border-secondary">
          <div class="d-flex flex-wrap align-items-center justify-content-between">
            <div>
              <span class="text-secondary small">Titulares totales:</span>
              <span id="summary-starters" class="badge bg-primary ms-1">0</span>
            </div>
            <div>
              <span class="text-secondary small">Rosters declarados:</span>
              <span id="summary-rosters" class="badge bg-info ms-1">0</span>
            </div>
            <div id="summary-diff-wrap">
              <span class="text-secondary small">Diferencia:</span>
              <span id="summary-diff" class="badge bg-secondary ms-1">0</span>
            </div>
          </div>
          <div id="summary-warning" class="mt-2 small text-warning d-none">
            <i class="bi bi-exclamation-triangle"></i>
            La suma de titulares excede los rosters. Ajusta los contadores o actualiza "Rosters" en la liga.
          </div>
        </div>
      </div>
      <div class="offcanvas-footer p-3 border-top border-secondary d-flex gap-2 justify-content-end">
        <button class="btn btn-outline-light" data-bs-dismiss="offcanvas">Cerrar</button>
        <button class="btn btn-success" id="btn-save-starters">
          <i class="bi bi-check2-circle"></i> Guardar
        </button>
      </div>
    </div>
  `;

  // Bind global UI controls
  document.getElementById('btn-view-table').addEventListener('click', () => switchView('table'));
  document.getElementById('btn-view-cards').addEventListener('click', () => switchView('cards'));

  // Modal "Nueva Liga"
  const modalAdd = new bootstrap.Modal(document.getElementById('modalAddLeague'));
  document.getElementById('btn-add-league').addEventListener('click', () => {
    document.getElementById('formAddLeague').reset();
    modalAdd.show();
  });
  document.getElementById('formAddLeague').addEventListener('submit', onSubmitAddLeague(modalAdd));

  // Offcanvas titulares
  const offcanvasEl = document.getElementById('offcanvasStarters');
  const ocInstance = new bootstrap.Offcanvas(offcanvasEl);
  document.getElementById('btn-save-starters').addEventListener('click', () => onSaveStarters(ocInstance));

  // Buscador local
  document.getElementById('league-search').addEventListener('input', onLocalSearch);

  // Inicialización: obtener userId y cargar ligas
  await initAndLoad();

  // Cuando se cierra offcanvas limpiamos dirty flag
  offcanvasEl.addEventListener('hidden.bs.offcanvas', () => (STATE.dirty = false));
}

/* ===============================
   Init + carga ligas (obteniendo userId desde Supabase client)
   =============================== */
async function initAndLoad() {
  try {
    const userId = await getUserIdFromClient();
    if (!userId) {
      showError('Debes iniciar sesión para ver tus ligas manuales.');
      window.location.hash = '#/login';
      return;
    }
    // Llamamos al helper de API que acepta userId
    await loadManualLeagues(userId);
  } catch (err) {
    showError('Error inicializando ligas: ' + (err.message || err));
  }
}

async function loadManualLeagues(userId = null) {
  try {
    const leagues = await fetchManualLeaguesByUser(userId);
    leagues.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    STATE.leagues = leagues;
    renderLeaguesTable(leagues);
    renderLeaguesCards(leagues);
  } catch (err) {
    showError('Error al cargar ligas: ' + (err.message || err));
  }
}

/* ===============================
   Render tabla
   =============================== */
function renderLeaguesTable(leagues) {
  const tbody = document.querySelector('#manualLeaguesTable tbody');
  if (!tbody) return;

  const rows = leagues.map(l => {
    const actions = `
      <div class="d-flex gap-2 justify-content-center">
        <button class="btn btn-sm btn-outline-warning btn-starters" data-id="${escapeHtml(String(l.id))}" data-lid="${escapeHtml(String(l.league_id))}" data-name="${encodeURIComponent(l.name || '')}" title="Configurar titulares">
          <i class="bi bi-people-fill"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger delete-league" data-id="${escapeHtml(String(l.id))}">
          <i class="bi bi-trash"></i>
        </button>
      </div>
    `;

    return [
      `<div class="text-white text-center">${l.id}</div>`,
      `<span class="fw-semibold">${escapeHtml(l.name)}</span>`,
      `<span class="fw-semibold">${escapeHtml(l.league_id || '-')}</span>`,
      `<div class="text-center">${booleanBadge(l.dynasty)}</div>`,
      `<div class="text-center">${booleanBadge(l.bestball)}</div>`,
      `<div class="text-white text-center">${escapeHtml(l.draft_id || '')}</div>`,
      `<div class="text-white text-center">${l.total_rosters ?? ''}</div>`,
      `<div class="text-center"><span class="badge bg-success text-uppercase">${escapeHtml(l.status || '')}</span></div>`,
      actions
    ];
  });

  if ($.fn.DataTable.isDataTable('#manualLeaguesTable')) {
    const table = $('#manualLeaguesTable').DataTable();
    table.clear().rows.add(rows).draw();
  } else {
    $('#manualLeaguesTable').DataTable({
      data: rows,
      responsive: true,
      paging: false,
      language: { url: '//cdn.datatables.net/plug-ins/2.3.2/i18n/es-MX.json' },
      dom: 'tip'
    });
  }

  // Eventos (con pequeño delay para asegurar DataTable DOM)
  setTimeout(() => {
    document.querySelectorAll('.delete-league').forEach(btn => {
      btn.removeEventListener?.('click', null);
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const ok = await confirmDialog('¿Eliminar esta liga? Esta acción no se puede deshacer.');
        if (!ok) return;
        try {
          await deleteManualLeague(id);
          showSuccess('Liga eliminada correctamente');
          await loadManualLeagues(await getUserIdFromClient());
        } catch (err) {
          showError('Error al eliminar liga: ' + (err.message || err));
        }
      });
    });

    document.querySelectorAll('.btn-starters').forEach(btn => {
      btn.removeEventListener?.('click', null);
      btn.addEventListener('click', async () => {
        const leagueId = btn.dataset.lid;
        const leagueName = decodeURIComponent(btn.dataset.name || '');
        const league = STATE.leagues.find(x => String(x.league_id) === String(leagueId)) || null;
        await openStartersDrawer(league, leagueName);
      });
    });
  }, 120);
}

/* ===============================
   Render tarjetas
   =============================== */
function renderLeaguesCards(leagues) {
  const grid = document.getElementById('cards-grid');
  if (!grid) return;

  grid.innerHTML = leagues.map(l => `
    <div class="col-12 col-md-6 col-lg-4">
      <div class="card league-card h-100">
        <div class="card-body d-flex flex-column">
          <div class="d-flex align-items-start justify-content-between mb-2">
            <div>
              <div class="small text-secondary">ID Interno #${escapeHtml(String(l.id))}</div>
              <h5 class="card-title m-0">${escapeHtml(l.name)}</h5>
              <div class="small text-secondary">League ID: <span class="text-white">${escapeHtml(l.league_id || '-')}</span></div>
            </div>
            <div class="d-flex flex-column align-items-end gap-1">
              ${l.dynasty === true ? '<span class="badge bg-success">Dynasty</span>' : ''}
              ${l.bestball === true ? '<span class="badge bg-info text-dark">BestBall</span>' : ''}
            </div>
          </div>

          <div class="mt-auto d-flex gap-2">
            <button class="btn btn-sm btn-outline-warning flex-grow-1 btn-starters"
              data-id="${escapeHtml(String(l.id))}" data-lid="${escapeHtml(String(l.league_id || ''))}" data-name="${encodeURIComponent(l.name || '')}">
              <i class="bi bi-people-fill"></i> Titulares
            </button>
            <button class="btn btn-sm btn-outline-danger btn-delete-card" data-id="${escapeHtml(String(l.id))}">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </div>
        <div class="card-footer small text-secondary d-flex justify-content-between">
          <span>Draft: <span class="text-white">${escapeHtml(l.draft_id || '-')}</span></span>
          <span>Rosters: <span class="text-white">${l.total_rosters ?? '-'}</span></span>
        </div>
      </div>
    </div>
  `).join('');

  // Bind actions
  grid.querySelectorAll('.btn-starters').forEach(btn => {
    btn.addEventListener('click', async () => {
      const leagueId = btn.dataset.lid;
      const leagueName = decodeURIComponent(btn.dataset.name || '');
      const league = STATE.leagues.find(x => String(x.league_id) === String(leagueId)) || null;
      await openStartersDrawer(league, leagueName);
    });
  });

  grid.querySelectorAll('.btn-delete-card').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const ok = await confirmDialog('¿Eliminar esta liga?');
      if (!ok) return;
      try {
        await deleteManualLeague(id);
        showSuccess('Liga eliminada correctamente');
        await loadManualLeagues(await getUserIdFromClient());
      } catch (err) {
        showError('Error al eliminar liga: ' + (err.message || err));
      }
    });
  });
}

/* ===============================
   Switch vista
   =============================== */
function switchView(mode) {
  if (STATE.viewMode === mode) return;
  STATE.viewMode = mode;
  document.getElementById('wrap-table').classList.toggle('d-none', mode !== 'table');
  document.getElementById('wrap-cards').classList.toggle('d-none', mode !== 'cards');
  document.getElementById('btn-view-table').classList.toggle('active', mode === 'table');
  document.getElementById('btn-view-cards').classList.toggle('active', mode === 'cards');
}

/* ===============================
   Buscador local
   =============================== */
function onLocalSearch(e) {
  const term = String(e.target.value || '').toLowerCase();
  const dt = $.fn.DataTable.isDataTable('#manualLeaguesTable') ? $('#manualLeaguesTable').DataTable() : null;
  if (dt) dt.search(term).draw();
  const cards = document.querySelectorAll('#cards-grid .card');
  cards.forEach(card => {
    const text = card.innerText.toLowerCase();
    card.parentElement.classList.toggle('d-none', !text.includes(term));
  });
}

/* ===============================
   Alta de liga
   =============================== */
function onSubmitAddLeague(modalAdd) {
  return async (e) => {
    e.preventDefault();
    const form = e.target;
    const formData = Object.fromEntries(new FormData(form).entries());
    const payload = {
      name: formData.name?.trim(),
      draft_id: formData.draft_id?.trim() || null,
      total_rosters: formData.total_rosters ? Number(formData.total_rosters) : null,
      dynasty: formData.dynasty === '' ? null : formData.dynasty === 'true',
      bestball: formData.bestball === '' ? null : formData.bestball === 'true',
      status: formData.status?.trim() || null,
    };

    try {
      await insertManualLeague(payload);
      showSuccess('Liga agregada correctamente');
      modalAdd.hide();
      await loadManualLeagues(await getUserIdFromClient());
    } catch (err) {
      showError('Error al insertar liga: ' + (err.message || err));
    }
  };
}

/* ===============================
   Drawer de Titulares
   =============================== */
async function openStartersDrawer(league, fallbackName = '') {
  if (!league) {
    showError('Liga no encontrada.');
    return;
  }
  STATE.currentLeague = league;
  const ocNameEl = document.getElementById('oc-league-name');
  const ocMetaEl = document.getElementById('oc-league-meta');
  ocNameEl.textContent = `Titulares – ${league.name || fallbackName}`;
  ocMetaEl.textContent = `League ID: ${league.league_id || '-'} · Rosters: ${league.total_rosters || '-'}`;

  // Carga settings existentes
  const settings = await fetchLeagueSettings(league.league_id);
  STATE.currentSettings = settings || { league_id: league.league_id, starter_positions: {} };

  renderPositionControls(STATE.currentSettings.starter_positions || {});
  updateSummary();

  const oc = new bootstrap.Offcanvas(document.getElementById('offcanvasStarters'));
  oc.show();

  // Presets binding (rebind safe)
  document.querySelectorAll('.preset-chip').forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.preset;
      const preset = LINEUP_PRESETS[key];
      if (!preset) return;
      STATE.currentSettings.starter_positions = { ...preset.sp };
      renderPositionControls(STATE.currentSettings.starter_positions);
      updateSummary();
      STATE.dirty = true;
    };
  });

  document.getElementById('btn-preset-custom').onclick = () => {
    // personalizado: el usuario ajusta manualmente
  };
}

/* ===============================
   Controles de posición
   =============================== */
function renderPositionControls(currentSP) {
  const wrap = document.getElementById('pos-controls');
  if (!wrap) return;
  wrap.innerHTML = POSITION_ORDER.map(pos => {
    const value = Number(currentSP?.[pos] ?? 0);
    return `
      <div class="col-6 col-md-4">
        <div class="pos-control">
          <div class="pos-label">
            <span class="pos-chip pos-${pos.toLowerCase()}">${pos.replace('_', ' ')}</span>
          </div>
          <div class="input-group input-group-sm">
            <button class="btn btn-outline-light btn-step" data-pos="${pos}" data-step="-1" type="button" aria-label="Restar ${pos}">−</button>
            <input class="form-control pos-input" data-pos="${pos}" type="number" min="0" step="1" value="${value}">
            <button class="btn btn-outline-light btn-step" data-pos="${pos}" data-step="1" type="button" aria-label="Sumar ${pos}">+</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  wrap.querySelectorAll('.btn-step').forEach(btn => {
    btn.addEventListener('click', () => {
      const pos = btn.dataset.pos;
      const step = Number(btn.dataset.step);
      const input = wrap.querySelector(`.pos-input[data-pos="${pos}"]`);
      const next = Math.max(0, Number(input.value || 0) + step);
      input.value = String(next);
      onPosChange();
    });
  });
  wrap.querySelectorAll('.pos-input').forEach(inp => {
    inp.addEventListener('input', onPosChange);
  });
}

function onPosChange() {
  const sp = {};
  document.querySelectorAll('.pos-input').forEach(inp => {
    const pos = inp.dataset.pos;
    const val = Math.max(0, Number(inp.value || 0));
    if (val > 0) sp[pos] = val;
  });
  STATE.currentSettings.starter_positions = sp;
  STATE.dirty = true;
  updateSummary();
}

function calcStartersTotal(sp) {
  return Object.values(sp || {}).reduce((a, b) => a + Number(b || 0), 0);
}

function updateSummary() {
  const starters = calcStartersTotal(STATE.currentSettings?.starter_positions || {});
  const rosters = Number(STATE.currentLeague?.total_rosters || 0);
  const diff = rosters ? (rosters - starters) : 0;
  const diffEl = document.getElementById('summary-diff');
  const warnEl = document.getElementById('summary-warning');

  document.getElementById('summary-starters').textContent = String(starters);
  document.getElementById('summary-rosters').textContent = String(rosters || 0);
  diffEl.textContent = String(diff);

  diffEl.classList.remove('bg-success', 'bg-warning', 'bg-danger', 'bg-secondary');
  if (!rosters) {
    diffEl.classList.add('bg-secondary');
    warnEl.classList.add('d-none');
  } else if (diff === 0) {
    diffEl.classList.add('bg-success');
    warnEl.classList.add('d-none');
  } else if (diff > 0) {
    diffEl.classList.add('bg-warning');
    warnEl.classList.add('d-none');
  } else {
    diffEl.classList.add('bg-danger');
    warnEl.classList.remove('d-none');
  }
}

/* ===============================
   Guardar starters
   =============================== */
async function onSaveStarters(offcanvas) {
  try {
    if (!STATE.currentLeague) return;
    const sp = STATE.currentSettings?.starter_positions || {};
    await upsertLeagueSettings(STATE.currentLeague.league_id, { starter_positions: sp });
    STATE.dirty = false;
    showSuccess('Titulares guardados correctamente');
    offcanvas.hide();
  } catch (err) {
    showError('Error al guardar titulares: ' + (err.message || err));
  }
}
