// frontend/src/views/draftConsenso.js
import { showSuccess, showError, showLoadingBar } from '../../components/alerts.js';
import { getAccessTokenFromClient } from '../../../components/authHelpers.js';
import { positions } from '../../components/constants.js';
import { renderLeagueSelect } from '../../components/selectLeagues.js';
import { fetchConsensusData } from '../../api.js';

// Ajusta si tu base cambia
const API_BASE = 'https://fantasy-nfl-backend.onrender.com';
const DRAFT_API_PATH = '/draft/consensus'; // endpoint consenso (no idExperto)

export default async function renderConsensusDraft() {
  // --- Render chrome (estructura similar a tu primera vista, con controles de la segunda) ---
  const content = document.getElementById('content-container');
  if (!content) return showError('No se encontró el contenedor de contenido.');

  content.innerHTML = `
    <style>
      /* pequeños estilos locales (puedes mover a css) */
      .draft-card { background:var(--bg-secondary,#1f2228); color:var(--text-primary,#e4e6eb); border:1px solid var(--border,#2f3033); border-radius:12px; padding:.75rem; height:100%;}
      .pos-badge { padding:.2rem .5rem; border-radius:.35rem; font-weight:600; display:inline-block; }
      .controls-row { display:flex; gap:.5rem; flex-wrap:wrap; align-items:center; margin-bottom:.75rem; }
      .small-muted { font-size:.85rem; color:var(--text-secondary,#b0b3b8); }
      .pagination-controls { display:flex; gap:.4rem; align-items:center; }
      .page-btn { min-width:36px; text-align:center; padding:.2rem .5rem; cursor:pointer; border-radius:.35rem; border:1px solid rgba(255,255,255,.06); background:transparent; color:inherit; }
      .page-btn[disabled] { opacity:.45; cursor:not-allowed; }
    </style>

    <div class="card border-0 shadow-sm rounded flock-card">
      <div class="card-body d-flex flex-column min-h-0">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h4 class="m-0 d-flex align-items-center gap-2">
            <i class="bi bi-list-stars text-warning"></i> Draft – Consenso (Inteligente)
          </h4>
          <div class="d-flex gap-2">
            <button id="btn-refresh-draft" class="btn btn-sm btn-outline-light"><i class="bi bi-arrow-clockwise"></i> Actualizar</button>
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
                <option value="adp_rank">ADP Rank</option>
                <option value="valueOverADP">Value/ADP</option>
                <option value="shark">SharkScore 🦈</option>
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
  const btnRefresh = document.getElementById('btn-refresh-draft');
  const cardsInfo = document.getElementById('cards-info');
  const paginationEl = document.getElementById('pagination');

  let draftData = [];
  let filtered = [];
  let myDrafted = [];
  let currentPage = 1;
  let pageSize = Number(pageSizeSel.value) || 12;
  let searchQuery = '';
  let sortBy = sortBySel.value;
  let sortDir = sortDirSel.value;

  // Restaurar filtros desde localStorage (opcional)
  try { positionSelect.value = localStorage.getItem('consensusPosition') || positionSelect.value; } catch(e){}
  try { statusSelect.value = localStorage.getItem('consensusStatus') || statusSelect.value; } catch(e){}
  try { sleeperADPCheckbox.checked = (localStorage.getItem('consensusSleeperADP') === 'true') || false; } catch(e){}

  // -------------------------
  // Utilidades (copiadas / adaptadas)
  // -------------------------
  function debounce(fn, wait = 200) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  const safeNum = (v, decimals = 2) => (typeof v === 'number' && Number.isFinite(v)) ? Number(v.toFixed(decimals)) : (Number.isFinite(+v) ? Number(Number(v).toFixed(decimals)) : '');
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function getHeatColor(value, min, max) {
    const v = Number(value);
    if (!Number.isFinite(v) || max === min) return '#888';
    const ratio = clamp((v - min) / (max - min), 0, 1);
    const r = Math.floor(255 * (1 - ratio));
    const g = Math.floor(255 * ratio);
    return `rgb(${r},${g},0)`;
  }

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

  function normalizePlayers(arr) {
    const toNum = (v) => (Number.isFinite(+v) ? +v : null);
    return arr.map(p => ({
      ...p,
      avg_rank: toNum(p.avg_rank),
      adp_rank: toNum(p.adp_rank),
      projection: toNum(p.projection),
      priorityScore: toNum(p.priorityScore),
      valueOverADP: toNum(p.valueOverADP),
      vor: toNum(p.vor),
      adjustedVOR: toNum(p.adjustedVOR),
      dropoff: toNum(p.dropoff),
      stealScore: toNum(p.stealScore),
      volatility: toNum(p.volatility),
      tier_global: toNum(p.tier_global),
      tier_pos: toNum(p.tier_pos),
    }));
  }

  // Ranges & shark score (copiado/adaptado)
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
  // Render / paginado
  // -------------------------
  function renderPlayersGrid() {
    const list = filtered;
    if (!list.length) {
      grid.innerHTML = '';
      empty.classList.remove('d-none');
      cardsInfo.textContent = 'Mostrando 0 de 0';
      return;
    }
    empty.classList.add('d-none');

    const start = (currentPage - 1) * pageSize;
    const pagePlayers = list.slice(start, start + pageSize);

    const prios = list.map(p => Number(p.priorityScore)).filter(Number.isFinite);
    const minPrio = prios.length ? Math.min(...prios) : 0;
    const maxPrio = prios.length ? Math.max(...prios) : 1;
    const maxProj = Math.max(...list.map(p => Number(p.projection) || 0), 1);

    grid.innerHTML = pagePlayers.map(p => {
      const posBadge = getPositionBadge(p.position);
      const statusBadge = p.status === 'LIBRE' ? '<span class="badge bg-success">LIBRE</span>' : '<span class="badge bg-secondary">Tomado</span>';
      const prioStyle = `background-color:${getHeatColor(p.priorityScore, minPrio, maxPrio)};color:#fff;padding:.1rem .5rem;border-radius:6px;font-weight:700;`;
      const projPct = Math.min(100, (Number(p.projection || 0) / maxProj) * 100);

      return `
        <div class="col-12 col-md-6 col-lg-4">
          <div class="draft-card h-100">
            <div class="d-flex justify-content-between align-items-start">
              <div class="min-w-0">
                <div class="fw-semibold text-truncate">${escapeHtml(p.nombre || '')}</div>
                <div class="small text-secondary mt-1">
                  ${posBadge} <span class="ms-1">${escapeHtml(p.team || '')}</span>
                  <span class="ms-2">Bye: <span class="text-white">${escapeHtml(p.bye ?? '—')}</span></span>
                </div>
              </div>
              <div class="text-end">
                ${statusBadge}
                <div class="mt-1"><span style="${prioStyle}">Prio ${safeNum(p.priorityScore)}</span></div>
              </div>
            </div>

            <div class="mt-2 d-flex gap-2 align-items-center small">
              <span class="badge bg-primary">Avg: ${safeNum(p.avg_rank,2)}</span>
              <span class="badge bg-info text-dark">ADP: ${safeNum(p.adp_rank,2)}</span>
              <span class="badge bg-warning text-dark">Val/ADP: ${safeNum(p.valueOverADP,2)}</span>
              <div class="ms-auto small">${(p.riskTags||[]).join(', ')}</div>
            </div>

            <div class="mt-2">
              <div class="small mb-1">Proyección</div>
              <div class="progress" style="height:8px;background:rgba(255,255,255,.06)"><div class="progress-bar" style="width:${projPct}%;"></div></div>
            </div>

            <div class="mt-2 d-flex gap-2 flex-wrap">
              ${p.valueTag ? `<span class="badge bg-success">${p.valueTag}</span>` : ''}
              ${p.tier_global_label ? `<span class="badge bg-danger">${p.tier_global ?? ''} ${p.tier_global_label}</span>` : ''}
              ${p.tier_pos_label ? `<span class="badge bg-primary">${p.tier_pos ?? ''} ${p.tier_pos_label}</span>` : ''}
            </div>

            <div class="mt-3 d-flex gap-2">
              <button data-action="detail" data-id="${escapeHtml(p.player_id)}" class="btn btn-sm btn-outline-light w-100">
                <i class="bi bi-zoom-in"></i> Detalles
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Delegación detalle
    grid.querySelectorAll('[data-action="detail"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const pid = btn.dataset.id;
        const pl = draftData.find(x => String(x.player_id) === String(pid));
        if (!pl) return;
        showSuccess(`${pl.nombre} · ${pl.team} · ${pl.position} (Bye ${pl.bye})`);
      });
    });

    cardsInfo.textContent = `Mostrando ${start + 1}-${Math.min(start + pageSize, list.length)} de ${list.length} jugadores`;
  }

  function renderPagination() {
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const firstDisabled = currentPage === 1 ? 'disabled' : '';
    const lastDisabled = currentPage === totalPages ? 'disabled' : '';

    paginationEl.innerHTML = `
      <button class="page-btn" id="btn-first" ${firstDisabled}>«</button>
      <button class="page-btn" id="btn-prev" ${firstDisabled}>‹</button>
      <div style="padding:0 .6rem">Página <strong>${currentPage}</strong> / ${totalPages}</div>
      <button class="page-btn" id="btn-next" ${lastDisabled}>›</button>
      <button class="page-btn" id="btn-last" ${lastDisabled}>»</button>
    `;

    document.getElementById('btn-first')?.addEventListener('click', () => { if (currentPage !== 1) { currentPage = 1; renderPlayersGrid(); renderPagination(); } });
    document.getElementById('btn-prev')?.addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderPlayersGrid(); renderPagination(); } });
    document.getElementById('btn-next')?.addEventListener('click', () => { const tot = Math.ceil(filtered.length / pageSize); if (currentPage < tot) { currentPage++; renderPlayersGrid(); renderPagination(); }});
    document.getElementById('btn-last')?.addEventListener('click', () => { const tot = Math.ceil(filtered.length / pageSize); if (currentPage !== tot) { currentPage = tot; renderPlayersGrid(); renderPagination(); }});
  }

  // -------------------------
  // Filtrado local (igual que segunda vista)
  // -------------------------
  function isFreeStatus(s) {
    const t = (s ?? '').toString().trim().toLowerCase();
    if (!t) return true;
    return ['libre', 'free', 'free agent', 'fa', 'available', 'waiver', 'waivers', 'waiver wire', 'waiver-wire', 'wa'].includes(t);
  }

  function applyFiltersAndSort() {
    const statusFilter = statusSelect.value || '';
    const posFilter = positionSelect.value || 'ALL';
    const byeCondition = Number(byeInput.value) || 0;
    const q = (searchQuery || '').trim().toLowerCase();

    filtered = draftData.filter(p => {
      // STATUS
      if (statusFilter && statusFilter !== 'TODOS') {
        if (statusFilter === 'LIBRE') {
          if (p.status !== 'LIBRE') return false;
        } else {
          if ((p.status || '').toUpperCase() !== statusFilter.toUpperCase()) return false;
        }
      }

      // POS
      if (posFilter && posFilter !== '' && posFilter !== 'ALL' && posFilter !== 'TODAS') {
        if ((p.position || '').toLowerCase() !== posFilter.toLowerCase()) return false;
      }

      // BYE
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
      // soporta avg_rank, adp_rank, valueOverADP (como primera vista)
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
        // desempata con adp_rank
        const aa = a?.adp_rank ?? Number.POSITIVE_INFINITY;
        const bb = b?.adp_rank ?? Number.POSITIVE_INFINITY;
        if (aa < bb) return -1 * dir;
        if (aa > bb) return 1 * dir;
        return 0;
      });
    }

    // PAGINACIÓN
    currentPage = 1;
    renderPlayersGrid();
    renderPagination();
  }

  // -------------------------
  // Fetch: se obtiene consenso desde backend (NO enviar idExperto)
  // -------------------------
  async function fetchConsensusData({ leagueId, position = 'ALL', byeCondition = 0, sleeperADP = false }) {
    const token = await getAccessTokenFromClient().catch(() => null);
    const headers = token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };

    const qs = new URLSearchParams({
      leagueId: String(leagueId || ''),
      position: String(position || 'ALL'),
      bye: String(Number(byeCondition || 0)),
      sleeperADP: sleeperADP ? '1' : '0'
    });

    const url = `${API_BASE}${DRAFT_API_PATH}?${qs.toString()}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(t || 'Error al descargar consenso');
    }
    const payload = await res.json();
    // esperado: { data: { players, my_drafted }, params }
    const players = payload?.data?.players ?? payload?.players ?? [];
    const params = payload?.data?.params ?? payload?.params ?? payload?.params ?? {};
    const my = payload?.data?.my_drafted ?? payload?.my_drafted ?? [];
    return { players, params, myDrafted: my };
  }

  // -------------------------
  // Carga principal
  // -------------------------
  async function loadConsensus() {
    try {
      // leagueId: prefer select; si existe query ?leagueId=... se preselecciona
      const qsLeagueId = (() => {
        try {
          const url = new URL(window.location.href);
          return url.searchParams.get('leagueId') ?? '';
        } catch (e) { return ''; }
      })();

      const leagueId = (document.querySelector('#select-league')?.tomselect?.getValue?.() || leagueSelect.value || qsLeagueId || '').toString().trim();
      if (!leagueId) {
        showError('Selecciona una liga (o añade ?leagueId=... en la URL).');
        return;
      }

      const position = positionSelect.value || 'ALL';
      const byeCond = Number(byeInput.value || 0);
      const sleeper = !!sleeperADPCheckbox.checked;

      showLoadingBar('Cargando consenso', 'Descargando jugadores...');
			const { players, params } = await fetchConsensusData(
			  leagueId,
			  position,
			  byeCondition,
			  sleeperADP
			);
      Swal.close();

      if (!players || !players.length) {
        draftData = [];
        filtered = [];
        myDrafted = [];
        renderPlayersGrid();
        showError('No se encontraron jugadores.');
        return;
      }

      draftData = normalizePlayers(players);
      myDrafted = Array.isArray(my) ? my : [];
      // publicar etiquetas fecha
      if (params?.ranks_published) {
        const fecha = new Date(params.ranks_published);
        ranksUpdatedLabel.innerHTML = `<div class="px-3 py-1 small rounded-pill" style="background-color:var(--bg-secondary); color:var(--text-primary); border:1px solid var(--border);">
          <i class="bi bi-calendar-check-fill text-success"></i> Ranks: ${fecha.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</div>`;
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

      applyFiltersAndSort();
      renderDraftedOffcanvas();
      showSuccess('Consenso actualizado');
    } catch (err) {
      Swal.close();
      console.error('loadConsensus error', err);
      showError('Error al cargar consenso: ' + (err?.message || err));
    }
  }

  // -------------------------
  // Offcanvas drafted
  // -------------------------
  function renderDraftedOffcanvas() {
    const wrap = document.getElementById('drafted-list');
    const countEl = document.getElementById('drafted-count');
    if (!wrap) return;
    const list = myDrafted || [];
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
                <span class="badge" style="background:${getPositionColor(p.position)};color:${getContrastTextColor(getPositionColor(p.position))}">${escapeHtml(p.position || '')}</span>
                <span class="ms-1">${escapeHtml(p.team || '')}</span>
                <span class="ms-2">Bye: <span class="text-white">${escapeHtml(p.bye ?? '—')}</span></span>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // -------------------------
  // Helpers DOM / eventos
  // -------------------------
  function escapeHtml(str) {
    return String(str ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  }

  // Init selects: renderLeagueSelect (TomSelect)
  let leagueTS = null;
  try {
    leagueTS = await renderLeagueSelect('#select-league', {
      plugins: ['dropdown_input'],
      dropdownInput: false,
      create: false,
      persist: false,
      onChange() {
        try { localStorage.setItem('consensusLeague', this.getValue?.() || ''); } catch(e) {}
        if (this && typeof this.blur === 'function') this.blur();
        loadConsensus();
      }
    });
  } catch (e) {
    // fallback: try again without async
    await renderLeagueSelect('#select-league', { plugins: ['dropdown_input'], dropdownInput: false, create: false, persist: false });
  }
  if (!leagueTS && document.querySelector('#select-league')?.tomselect) leagueTS = document.querySelector('#select-league').tomselect;

  // Aplicar saved league desde querystring o localStorage
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

  // Eventos UI
  statusSelect.addEventListener('change', () => { try{ localStorage.setItem('consensusStatus', statusSelect.value); }catch{} applyFiltersAndSort(); });
  positionSelect.addEventListener('change', () => { try{ localStorage.setItem('consensusPosition', positionSelect.value); }catch{} applyFiltersAndSort(); });
  byeInput.addEventListener('input', debounce(() => applyFiltersAndSort(), 200));
  sleeperADPCheckbox.addEventListener('change', () => { try{ localStorage.setItem('consensusSleeperADP', sleeperADPCheckbox.checked); }catch{} loadConsensus(); });

  pageSizeSel.addEventListener('change', () => { pageSize = Number(pageSizeSel.value) || 12; currentPage = 1; renderPlayersGrid(); renderPagination(); });
  sortBySel.addEventListener('change', () => { sortBy = sortBySel.value; applyFiltersAndSort(); });
  sortDirSel.addEventListener('change', () => { sortDir = sortDirSel.value; applyFiltersAndSort(); });

  searchInput.addEventListener('input', debounce((e) => { searchQuery = e.target.value || ''; currentPage = 1; applyFiltersAndSort(); }, 250));

  btnRefresh.addEventListener('click', loadConsensus);

  // Inicial: lista vacía
  filtered = [];
  renderPlayersGrid();
  renderPagination();

  // Si existe liga ya seleccionada, carga
  const initialLeague = (document.querySelector('#select-league')?.tomselect?.getValue?.() || leagueSelect.value || '').toString().trim();
  if (initialLeague) await loadConsensus();

  // Offcanvas open handler to refresh drafted list
  document.getElementById('btn-refresh-draft')?.addEventListener('click', loadConsensus);
  document.querySelector('[data-bs-target="#offcanvasDrafted"]')?.addEventListener('click', renderDraftedOffcanvas);
}
