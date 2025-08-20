// frontend/src/views/manualLeagues.js
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
  STANDARD: { label: 'Standard', sp: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DST: 1 } },
  HALF_PPR: { label: 'Half-PPR', sp: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DST: 1 } },
  PPR: { label: 'PPR', sp: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DST: 1 } },
  SUPERFLEX: { label: 'Superflex', sp: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPER_FLEX: 1, K: 0, DST: 1 } },
  TE_PREMIUM: { label: 'TE-Premium', sp: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DST: 1 } },
};

// Eliminadas DL, LB, DB según tu pedido
const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPER_FLEX', 'K', 'DST'];

function getInitialViewMode() {
  // En pantallas pequeñas inicia en cards; en desktop, tabla
  return (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) ? 'cards' : 'table';
}

let STATE = {
  leagues: [],
  viewMode: getInitialViewMode(),
  currentLeague: null,
  currentSettings: null,
  dirty: false,
  editingLeague: null, // guarda league_id (UUID) cuando editamos
  dt: null,            // instancia DataTable
};

/* ===============================
   UI Helpers
   =============================== */
function booleanBadge(val) {
  if (val === true) return '<span class="badge bg-success">Sí</span>';
  if (val === false) return '<span class="badge bg-danger">No</span>';
  return '<span class="badge bg-secondary">--</span>';
}
function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
async function confirmDialog(message) {
  try {
    const result = await showConfirm(typeof message === 'string' ? { text: message } : message);
    if (typeof result === 'boolean') return result;
    if (result && (result.isConfirmed !== undefined)) return result.isConfirmed;
    if (result && (result.confirmed !== undefined)) return result.confirmed;
    return Boolean(result);
  } catch {
    return confirm(typeof message === 'string' ? message : (message?.text || '¿Confirmar?'));
  }
}

/* Bootstrap confirm dialog (robusto para eliminar) */
function bootstrapConfirmDelete({ title = 'Confirmar eliminación', body = '', confirmText = 'Eliminar', cancelText = 'Cancelar' } = {}) {
  return new Promise((resolve) => {
    let modal = document.getElementById('modalConfirmDelete');
    if (!modal) {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = `
        <div class="modal fade" id="modalConfirmDelete" tabindex="-1" aria-hidden="true">
          <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content bg-dark text-white border border-secondary">
              <div class="modal-header border-secondary">
                <h5 class="modal-title"></h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
              </div>
              <div class="modal-body"></div>
              <div class="modal-footer border-secondary">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">${cancelText}</button>
                <button type="button" id="btn-yes-delete" class="btn btn-danger">
                  <i class="bi bi-trash"></i> ${confirmText}
                </button>
              </div>
            </div>
          </div>
        </div>`;
      document.body.appendChild(wrapper.firstElementChild);
      modal = document.getElementById('modalConfirmDelete');
    }
    modal.querySelector('.modal-title').textContent = title;
    modal.querySelector('.modal-body').innerHTML = body;

    const m = new bootstrap.Modal(modal);
    m.show();

    const yesBtn = modal.querySelector('#btn-yes-delete');
    const cleanup = () => {
      yesBtn?.removeEventListener('click', onYes);
      modal.removeEventListener('hidden.bs.modal', onHide);
    };
    const onYes = () => { cleanup(); m.hide(); resolve(true); };
    const onHide = () => { cleanup(); resolve(false); };
    yesBtn?.addEventListener('click', onYes, { once: true });
    modal.addEventListener('hidden.bs.modal', onHide, { once: true });
  });
}

/* ===============================
   Cargar styles desde css/leagues.css (Bootstrap ya presente)
   =============================== */
function loadLeagueStyles() {
  if (!document.querySelector('link[data-style="leagues"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '../../css/leagues.css'; // ajusta ruta si tu estructura es diferente
    link.dataset.style = 'leagues';
    document.head.appendChild(link);
  }
}

/* ===============================
   Render principal
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

        <!-- Panel de Tabla con viewport propio (no expande ventana) -->
        <div id="table-panel" class="${STATE.viewMode === 'table' ? '' : 'd-none'}">
          <div id="dt-viewport" class="dt-viewport border border-secondary rounded">
            <table id="manualLeaguesTable" class="table table-dark table-hover align-middle w-100">
              <thead class="table-dark text-uppercase text-secondary small">
                <tr>
                  <th style="width:6%;">ID</th>
                  <th style="width:28%;">Nombre</th>
                  <th style="width:18%;">League ID</th>
                  <th style="width:6%;">Dynasty</th>
                  <th style="width:6%;">BestBall</th>
                  <th style="width:12%;">Draft ID</th>
                  <th style="width:8%;">Equipos</th>
                  <th style="width:8%;">Status</th>
                  <th style="width:8%;" class="text-center">Acciones</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
          <div class="small text-secondary mt-1">* Desliza dentro del panel si hay muchas filas</div>
        </div>

        <!-- Panel de Tarjetas -->
        <div id="wrap-cards" class="${STATE.viewMode === 'cards' ? '' : 'd-none'}">
          <div id="cards-grid" class="row g-3"></div>
        </div>
      </div>
    </div>

    <!-- Modal: Nueva / Editar Liga -->
    <div class="modal fade" id="modalAddLeague" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content bg-dark text-white">
          <div class="modal-header border-secondary">
            <h5 class="modal-title" id="modalAddLeagueTitle">Agregar Liga Manual</h5>
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
                <label class="form-label">Equipos</label>
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
              <span class="text-secondary small">Equipos declarados:</span>
              <span id="summary-rosters" class="badge bg-info ms-1">0</span>
            </div>
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

  // Element references + instances
  const modalAddEl = document.getElementById('modalAddLeague');
  const modalAddInstance = new bootstrap.Modal(modalAddEl);
  const offcanvasEl = document.getElementById('offcanvasStarters');
  const ocInstance = new bootstrap.Offcanvas(offcanvasEl);

  // Bind UI controls
  document.getElementById('btn-view-table').addEventListener('click', () => switchView('table'));
  document.getElementById('btn-view-cards').addEventListener('click', () => switchView('cards'));

  document.getElementById('btn-add-league').addEventListener('click', () => {
    STATE.editingLeague = null;
    document.getElementById('modalAddLeagueTitle').textContent = 'Agregar Liga Manual';
    document.getElementById('formAddLeague').reset();
    modalAddInstance.show();
  });

  // Submit (alta / edición)
  document.getElementById('formAddLeague').addEventListener('submit', onSubmitAddLeague(modalAddInstance));

  // Offcanvas save
  document.getElementById('btn-save-starters').addEventListener('click', () => onSaveStarters(ocInstance));

  // Search
  document.getElementById('league-search').addEventListener('input', onLocalSearch);

  // Delegated clicks table
  document.querySelector('#manualLeaguesTable tbody').addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button');
    if (!btn) return;

    if (btn.classList.contains('btn-starters')) {
      const leagueId = btn.dataset.lid || btn.dataset.id;
      const leagueName = decodeURIComponent(btn.dataset.name || '');
      const league = STATE.leagues.find(x =>
        String(x.league_id) === String(leagueId) || String(x.id) === String(leagueId)
      ) || null;
      await openStartersDrawer(league, leagueName);

    } else if (btn.classList.contains('delete-league')) {
      const parsedId = resolveLeagueInternalIdFromTableClick(btn);
      if (Number.isNaN(parsedId)) {
        showError('ID de liga inválido. Reintenta y revisa la consola.');
        return;
      }

      const league = STATE.leagues.find(l => Number(l.id) === Number(parsedId));
      const title = '¿Eliminar liga?';
      const body = `
        <div class="d-flex flex-column gap-2">
          <div>Estás por eliminar la liga:</div>
          <div class="p-2 rounded border border-secondary bg-dark-subtle">
            <div><strong>${escapeHtml(league?.name ?? '(sin nombre)')}</strong></div>
            <div class="small text-secondary">Interno ID: ${parsedId} · League ID: ${escapeHtml(league?.league_id ?? '-')}</div>
          </div>
          <div class="text-warning small">Esta acción no se puede deshacer.</div>
        </div>
      `;
      const ok = await bootstrapConfirmDelete({ title, body, confirmText: 'Eliminar' });
      if (!ok) return;

      try {
        const token = await getAccessTokenFromClient().catch(() => null);
        await deleteManualLeague(parsedId, token);
        showSuccess('Liga eliminada correctamente');
        const userId = await getUserIdFromClient();
        const token2 = await getAccessTokenFromClient().catch(() => null);
        await loadManualLeagues(userId, token2);
      } catch (err) {
        console.error('Error deleteManualLeague:', err);
        showError('Error al eliminar liga: ' + (err.message || err));
      }

    } else if (btn.classList.contains('btn-edit-league')) {
      openEditLeague(btn.dataset.id, modalAddInstance);
    }
  });

  // Delegated clicks cards
  document.getElementById('cards-grid').addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button');
    if (!btn) return;

    if (btn.classList.contains('btn-starters')) {
      const leagueId = btn.dataset.lid || btn.dataset.id;
      const leagueName = decodeURIComponent(btn.dataset.name || '');
      const league = STATE.leagues.find(x =>
        String(x.league_id) === String(leagueId) || String(x.id) === String(leagueId)
      ) || null;
      await openStartersDrawer(league, leagueName);

    } else if (btn.classList.contains('btn-delete-card')) {
      let rawId = btn.dataset.id ?? btn.getAttribute('data-id') ?? null;
      const container = btn.closest('[data-id]');
      if ((!rawId || rawId === 'undefined') && container) rawId = container.dataset.id;

      const parsedId = Number.isFinite(Number(rawId)) ? Number(rawId) : NaN;
      if (Number.isNaN(parsedId)) {
        showError('ID de liga inválido. Reintenta y revisa la consola.');
        return;
      }

      const league = STATE.leagues.find(l => Number(l.id) === Number(parsedId));
      const title = '¿Eliminar liga?';
      const body = `
        <div class="d-flex flex-column gap-2">
          <div>Estás por eliminar la liga:</div>
          <div class="p-2 rounded border border-secondary bg-dark-subtle">
            <div><strong>${escapeHtml(league?.name ?? '(sin nombre)')}</strong></div>
            <div class="small text-secondary">Interno ID: ${parsedId} · League ID: ${escapeHtml(league?.league_id ?? '-')}</div>
          </div>
          <div class="text-warning small">Esta acción no se puede deshacer.</div>
        </div>
      `;
      const ok = await bootstrapConfirmDelete({ title, body, confirmText: 'Eliminar' });
      if (!ok) return;

      try {
        const token = await getAccessTokenFromClient().catch(() => null);
        await deleteManualLeague(parsedId, token);
        showSuccess('Liga eliminada correctamente');
        const userId = await getUserIdFromClient();
        const token2 = await getAccessTokenFromClient().catch(() => null);
        await loadManualLeagues(userId, token2);
      } catch (err) {
        console.error('Error deleteManualLeague (card):', err);
        showError('Error al eliminar liga: ' + (err.message || err));
      }

    } else if (btn.classList.contains('btn-edit-card')) {
      openEditLeague(btn.dataset.id, modalAddInstance);
    }
  });

  // Inicialización: obtener userId y token y cargar ligas
  await initAndLoad();

  // Limpiar dirty flag al cerrar offcanvas
  offcanvasEl.addEventListener('hidden.bs.offcanvas', () => (STATE.dirty = false));

  // Ajuste de alto del DataTable en resize
  window.addEventListener('resize', debounce(recalcTableHeight, 150));
}

/* ===============================
   Init + carga ligas
   =============================== */
async function initAndLoad() {
  try {
    const userId = await getUserIdFromClient();
    const token = await getAccessTokenFromClient().catch(() => null);

    if (!userId) {
      showError('Debes iniciar sesión para ver tus ligas manuales.');
      window.location.hash = '#/login';
      return;
    }
    await loadManualLeagues(userId, token);
  } catch (err) {
    showError('Error inicializando ligas: ' + (err.message || err));
  }
}

async function loadManualLeagues(userId = null, accessToken = null) {
  try {
    const leagues = await fetchManualLeaguesByUser(userId, accessToken);
    leagues.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    STATE.leagues = leagues;
    renderLeaguesTable(leagues);
    renderLeaguesCards(leagues);
    recalcTableHeight(); // asegura alto correcto tras render
  } catch (err) {
    showError('Error al cargar ligas: ' + (err.message || err));
  }
}

/* ===============================
   Render tabla (DataTables con scroll interno)
   =============================== */
function renderLeaguesTable(leagues) {
  const tbody = document.querySelector('#manualLeaguesTable tbody');
  if (!tbody) return;

  const rows = leagues.map(l => {
    const actions = `
      <div class="d-flex gap-2 justify-content-center">
        <button class="btn btn-sm btn-outline-warning btn-starters" data-id="${escapeHtml(String(l.id))}" data-lid="${escapeHtml(String(l.league_id || ''))}" data-name="${encodeURIComponent(l.name || '')}" title="Configurar titulares">
          <i class="bi bi-people-fill"></i>
        </button>
        <button class="btn btn-sm btn-outline-info btn-edit-league" data-id="${escapeHtml(String(l.id))}" title="Editar liga">
          <i class="bi bi-pencil"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger delete-league" data-id="${escapeHtml(String(l.id))}" title="Eliminar liga">
          <i class="bi bi-trash"></i>
        </button>
      </div>
    `;

    return [
      `<div class="text-white text-center">${l.id}</div>`,
      `<div class="text-truncate fw-semibold" title="${escapeHtml(l.name)}">${escapeHtml(l.name)}</div>`,
      `<div class="text-truncate fw-semibold" title="${escapeHtml(l.league_id || '-')}">${escapeHtml(l.league_id || '-')}</div>`,
      `<div class="text-center">${booleanBadge(l.dynasty)}</div>`,
      `<div class="text-center">${booleanBadge(l.bestball)}</div>`,
      `<div class="text-truncate text-white" title="${escapeHtml(l.draft_id || '')}">${escapeHtml(l.draft_id || '')}</div>`,
      `<div class="text-center text-white">${l.total_rosters ?? ''}</div>`,
      `<div class="text-center"><span class="badge bg-success text-uppercase">${escapeHtml(l.status || '')}</span></div>`,
      actions
    ];
  });

  // Reiniciar si ya existe
  if ($.fn.DataTable.isDataTable('#manualLeaguesTable')) {
    STATE.dt.clear().rows.add(rows).draw(false);
    return;
  }

  STATE.dt = $('#manualLeaguesTable').DataTable({
    data: rows,
    responsive: {
      details: { type: 'inline' } // permite expandir filas en pantallas reducidas
    },
    autoWidth: false,
    deferRender: true,
    paging: false,           // usamos scroll interno, no paginación
    info: false,
    ordering: true,
    language: { url: '//cdn.datatables.net/plug-ins/2.3.2/i18n/es-MX.json' },
    dom: 't', // sólo tabla (search externo)
    scrollY: computeTableHeight(), // altura dinámica
    scrollCollapse: true,
    columnDefs: [
      { targets: 0, width: '70px', responsivePriority: 1 },
      { targets: 1, responsivePriority: 1 },
      { targets: 2, responsivePriority: 2 },
      { targets: 3, responsivePriority: 4 },
      { targets: 4, responsivePriority: 4 },
      { targets: 5, responsivePriority: 6 },
      { targets: 6, responsivePriority: 3 },
      { targets: 7, responsivePriority: 2 },
      { targets: -1, orderable: false, searchable: false, responsivePriority: 1 }
    ]
  });
}

/* ===============================
   Render tarjetas
   =============================== */
function renderLeaguesCards(leagues) {
  const grid = document.getElementById('cards-grid');
  if (!grid) return;

  grid.innerHTML = leagues.map(l => `
    <div class="col-12 col-md-6 col-lg-4" data-id="${escapeHtml(String(l.id))}">
      <div class="card league-card h-100">
        <div class="card-body d-flex flex-column">
          <div class="d-flex align-items-start justify-content-between mb-2">
            <div>
              <div class="small text-secondary">ID Interno #${escapeHtml(String(l.id))}</div>
              <h5 class="card-title m-0 text-truncate" title="${escapeHtml(l.name)}">${escapeHtml(l.name)}</h5>
              <div class="small text-secondary">League ID: <span class="text-white" title="${escapeHtml(l.league_id || '-')}">${escapeHtml(l.league_id || '-')}</span></div>
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
            <button class="btn btn-sm btn-outline-info btn-edit-card" data-id="${escapeHtml(String(l.id))}" title="Editar">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger btn-delete-card" data-id="${escapeHtml(String(l.id))}">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </div>
        <div class="card-footer small text-secondary d-flex justify-content-between">
          <span>Draft: <span class="text-white" title="${escapeHtml(l.draft_id || '-')}">${escapeHtml(l.draft_id || '-')}</span></span>
          <span>Equipos: <span class="text-white">${l.total_rosters ?? '-'}</span></span>
        </div>
      </div>
    </div>
  `).join('');

  // Hacer el contenedor de cartas scrolleable sin expandir pantalla
  const wrap = document.getElementById('wrap-cards');
  if (wrap) {
    wrap.style.maxHeight = cardsViewportHeight() + 'px';
    wrap.style.overflow = 'auto';
  }
}

/* ===============================
   Switch vista
   =============================== */
function switchView(mode) {
  if (STATE.viewMode === mode) return;
  STATE.viewMode = mode;
  document.getElementById('table-panel').classList.toggle('d-none', mode !== 'table');
  document.getElementById('wrap-cards').classList.toggle('d-none', mode !== 'cards');
  document.getElementById('btn-view-table').classList.toggle('active', mode === 'table');
  document.getElementById('btn-view-cards').classList.toggle('active', mode === 'cards');

  if (mode === 'table') {
    // fuerza recalcular alto/columnas al entrar
    setTimeout(recalcTableHeight, 0);
  } else {
    const wrap = document.getElementById('wrap-cards');
    if (wrap) {
      wrap.style.maxHeight = cardsViewportHeight() + 'px';
      wrap.style.overflow = 'auto';
    }
  }
}

/* ===============================
   Buscador local
   =============================== */
function onLocalSearch(e) {
  const term = String(e.target.value || '').toLowerCase();
  const dt = STATE.dt;
  if (dt) dt.search(term).draw(false);
  const cards = document.querySelectorAll('#cards-grid .card');
  cards.forEach(card => {
    const text = (card.innerText || '').toLowerCase();
    card.parentElement.classList.toggle('d-none', !text.includes(term));
  });
}

/* ===============================
   Alta / edición de liga
   =============================== */
function onSubmitAddLeague(modalInstance) {
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
      const accessToken = await getAccessTokenFromClient();
      if (!accessToken) {
        showError('Debes iniciar sesión.');
        window.location.hash = '#/login';
        return;
      }

      // Si estamos editando, añadimos league_id (NO el id interno)
      if (STATE.editingLeague) {
        payload.league_id = STATE.editingLeague;
      }

      // insertManualLeague se asume que hace upsert cuando le envías league_id
      await insertManualLeague(payload, accessToken);

      showSuccess(STATE.editingLeague ? 'Liga actualizada correctamente' : 'Liga agregada correctamente');
      STATE.editingLeague = null;
      modalInstance.hide();

      const userId = await getUserIdFromClient();
      const token2 = await getAccessTokenFromClient().catch(() => null);
      await loadManualLeagues(userId, token2);
    } catch (err) {
      showError('Error al insertar/actualizar liga: ' + (err.message || err));
    }
  };
}

function openEditLeague(id, modalInstance) {
  const league = STATE.leagues.find(l => String(l.id) === String(id));
  if (!league) {
    showError('Liga no encontrada para editar.');
    return;
  }
  // guardamos league_id (UUID) para que el backend haga upsert por league_id
  STATE.editingLeague = league.league_id || null;
  const form = document.getElementById('formAddLeague');
  form.name.value = league.name || '';
  form.draft_id.value = league.draft_id || '';
  form.total_rosters.value = league.total_rosters ?? '';
  form.dynasty.value = league.dynasty === true ? 'true' : (league.dynasty === false ? 'false' : '');
  form.bestball.value = league.bestball === true ? 'true' : (league.bestball === false ? 'false' : '');
  form.status.value = league.status || '';
  document.getElementById('modalAddLeagueTitle').textContent = 'Editar Liga';
  modalInstance.show();
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
  ocMetaEl.textContent = `League ID: ${league.league_id || '-'} · Equipos: ${league.total_rosters || '-'}`;

  // Carga settings existentes
  const settings = await fetchLeagueSettings(league.league_id);
  STATE.currentSettings = settings || { league_id: league.league_id, starter_positions: {} };

  renderPositionControls(STATE.currentSettings.starter_positions || {});
  updateSummary();

  const oc = new bootstrap.Offcanvas(document.getElementById('offcanvasStarters'));
  oc.show();

  // Presets binding
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
          <div class="input-group">
            <button class="btn btn-outline-light btn-step" data-pos="${pos}" data-step="-1" type="button" aria-label="Restar ${pos}">−</button>
            <input class="form-control pos-input" data-pos="${pos}" type="number" min="0" step="1" value="${value}">
            <button class="btn btn-outline-light btn-step" data-pos="${pos}" data-step="1" type="button" aria-label="Sumar ${pos}">+</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Delegado dentro del wrap
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
  document.getElementById('summary-starters').textContent = String(starters);
  document.getElementById('summary-rosters').textContent = String(rosters || 0);
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

/* ===============================
   Utilidades de tamaño / robustez
   =============================== */
function computeTableHeight() {
  // Calcula un alto para el scroll interno del DataTable, evitando scroll de toda la página
  const viewport = window.innerHeight || document.documentElement.clientHeight;
  const panel = document.getElementById('dt-viewport');
  const rect = panel ? panel.getBoundingClientRect() : { top: 180 };
  const margins = 48; // margen/padding inferior aprox
  // aseguremos un mínimo utilizable en móviles
  const height = Math.max(260, Math.min(720, Math.floor(viewport - rect.top - margins)));
  return height + 'px';
}

function cardsViewportHeight() {
  const viewport = window.innerHeight || document.documentElement.clientHeight;
  const wrap = document.getElementById('wrap-cards');
  const rect = wrap ? wrap.getBoundingClientRect() : { top: 180 };
  const margins = 48;
  return Math.max(260, Math.min(720, Math.floor(viewport - rect.top - margins)));
}

function recalcTableHeight() {
  if (!STATE.dt) return;
  const newY = computeTableHeight();
  const settings = STATE.dt.settings()[0];
  if (settings && settings.oScroll) {
    settings.oScroll.sY = newY;
    STATE.dt.columns.adjust().draw(false);
    // Forzar recalcular responsive
    if (STATE.dt.responsive) {
      STATE.dt.responsive.recalc();
    }
  }
}

function debounce(fn, wait = 150) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/* Extrae ID interno desde el botón o desde la fila de DataTables (fallback robusto) */
function resolveLeagueInternalIdFromTableClick(btn) {
  // 1) Preferir dataset del botón
  let rawId = btn.dataset.id ?? btn.getAttribute('data-id') ?? null;
  if (rawId && rawId !== 'undefined') {
    const parsed = Number(rawId);
    if (Number.isFinite(parsed)) return parsed;
  }

  // 2) Intentar obtener data desde la fila de DataTables
  try {
    const tr = btn.closest('tr');
    const dt = STATE.dt;
    if (dt && tr) {
      const data = dt.row(tr).data(); // array de celdas (strings HTML)
      if (Array.isArray(data) && data.length) {
        const firstCellHtml = data[0] ?? '';
        const idMatch = String(firstCellHtml).match(/>(\d+)</);
        if (idMatch && idMatch[1]) {
          const parsed = Number(idMatch[1]);
          if (Number.isFinite(parsed)) return parsed;
        }
      }
    }
  } catch (e) {
    console.warn('No se pudo resolver ID desde DataTables:', e);
  }

  // 3) Fallback a inspeccionar el primer td visible
  const tr = btn.closest('tr');
  const firstTd = tr ? tr.querySelector('td') : null;
  if (firstTd) {
    const m = firstTd.innerHTML.match(/(\d+)/);
    if (m && m[1] && Number.isFinite(Number(m[1]))) return Number(m[1]);
  }

  return NaN;
}
