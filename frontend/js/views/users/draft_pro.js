// frontend/src/views/draft_main.js
import { fetchDraftData } from '../apiDraft.js'; // ✅ NUEVO: wrapper hacia /manual/draft/:league_id
import { fetchManualLeaguesByUser } from '../apiUsers.js'; // ✅ ya lo tenías
import { positions } from '../../../components/constants.js';
import { showError, showLoadingBar } from '../../../components/alerts.js';
import { renderExpertSelect } from '../../../components/selectExperts.js';
import { getAccessTokenFromClient, getUserIdFromClient } from '../../../components/authHelpers.js';

export default async function renderDraftView() {
  const content = document.getElementById('content-container');

  content.innerHTML = `
    <style>
      /* ====== Layout & Panels ====== */
      #draft-topbar { display:flex; gap:.75rem; align-items:center; justify-content:space-between; flex-wrap:wrap; }
      #best-pick { border:1px solid var(--border, rgba(255,255,255,.08)); border-radius:.9rem; padding:.85rem; background:linear-gradient(180deg, rgba(13,202,240,.08), rgba(13,202,240,.02)); }
      #best-pick .title { font-weight:700; display:flex; align-items:center; gap:.5rem; }
      #best-pick .meta { display:flex; gap:.75rem; flex-wrap:wrap; font-size:.9rem; opacity:.9; }
      #needs-panel { border:1px solid var(--border, rgba(255,255,255,.08)); border-radius:.9rem; padding:.75rem; background: var(--bg-secondary, #1e1e1e); }
      #needs-panel .need-item { display:flex; align-items:center; justify-content:space-between; gap:.5rem; padding:.35rem .5rem; border-radius:.5rem; }
      #needs-panel .bar { height:8px; background: rgba(255,255,255,.08); border-radius:6px; overflow:hidden; flex:1; }
      #needs-panel .bar>div { height:100%; background:#0dcaf0; }

      /* Cards */
      #draft-cards .draft-card {
        background: var(--bg-secondary, #1e1e1e);
        color: var(--text-primary, #f8f9fa);
        border: 1px solid var(--border, rgba(255,255,255,.08));
        border-radius: .75rem;
        padding: .75rem .9rem;
        height: 100%;
      }
      #draft-cards .title-row {
        display:flex; align-items:center; justify-content:space-between; gap:.5rem; margin-bottom:.35rem;
      }
      #draft-cards .player { font-weight:600; font-size:1rem; line-height:1.2; }
      #draft-cards .meta { display:flex; flex-wrap:wrap; gap:.5rem .75rem; font-size:.85rem; opacity:.9; }
      #draft-cards .kv { display:flex; gap:.25rem; align-items:center; }
      #draft-cards .progress { height:10px; background: rgba(255,255,255,.08); }
      #draft-cards .progress-bar { background-color:#0dcaf0; }
      .star-btn { border:1px solid rgba(255,255,255,.1); background:transparent; color:inherit; padding:.15rem .45rem; border-radius:.45rem; cursor:pointer; }
      .star-btn.active { background:rgba(255,255,255,.08); }

      /* Controls row */
      #cards-controls { display:flex; gap:.5rem; flex-wrap:wrap; align-items:center; margin-bottom:.75rem; }
      #cards-controls .flex-right { margin-left:auto; display:flex; gap:.5rem; align-items:center; }

      .pagination-controls { display:flex; gap:.4rem; align-items:center; }
      .page-btn { min-width:36px; text-align:center; padding:.2rem .5rem; cursor:pointer; border-radius:.35rem; border:1px solid rgba(255,255,255,.06); background:transparent; color:inherit; }
      .page-btn[disabled] { opacity:.45; cursor:not-allowed; }

      /* Queue pill */
      #queue-pill { display:flex; gap:.5rem; align-items:center; border:1px solid var(--border, rgba(255,255,255,.08)); padding:.3rem .6rem; border-radius:999px; background:var(--bg-secondary, #1e1e1e); }
      #queue-pill .q-item { font-size:.85rem; opacity:.9; }

      /* Responsive grid tweaks */
      @media(min-width:1200px) {
        #draft-cards .col-lg-3 { max-width: 23%; flex: 0 0 23%; }
      }

      /* Bootstrap tooltip (fallback simple) */
      .hint { border-bottom:1px dotted rgba(255,255,255,.5); cursor:help; }
    </style>

    <div class="card border-0 shadow-sm rounded flock-card">
      <div class="card-body">
        <div id="draft-topbar" class="mb-3">
          <h4 class="m-0 d-flex align-items-center gap-2">
            <i class="bi bi-clipboard-data text-info"></i> Draft Inteligente
          </h4>

          <div class="d-flex align-items-center gap-2">
            <div id="queue-pill" class="d-none">
              <i class="bi bi-star-fill text-warning"></i>
              <div id="queue-items" class="d-flex gap-2 flex-wrap"></div>
              <button class="btn btn-sm btn-outline-secondary" id="btn-clear-queue" title="Vaciar cola">Limpiar</button>
            </div>
            <button class="btn btn-sm btn-primary" id="btn-update-draft">
              <i class="bi bi-arrow-clockwise"></i> Actualizar Draft
            </button>
          </div>
        </div>

        <!-- Best Pick + Needs -->
        <div class="row g-2 mb-3">
          <div class="col-12 col-lg-8">
            <div id="best-pick" class="d-none">
              <div class="title"><i class="bi bi-lightning-fill text-warning"></i> Mejor pick ahora</div>
              <div id="best-pick-body" class="mt-2"></div>
            </div>
          </div>
          <div class="col-12 col-lg-4">
            <div id="needs-panel" class="d-none">
              <div class="d-flex align-items-center gap-2 mb-2">
                <i class="bi bi-graph-up-arrow text-info"></i>
                <strong>Necesidades por posición</strong>
              </div>
              <div id="needs-body"></div>
            </div>
          </div>
        </div>

        <form class="row g-3 mb-3">
          <div class="col-md-3">
            <label for="select-league" class="form-label">Liga</label>
            <select id="select-league" class="form-select"></select>
          </div>
          <div class="col-md-2">
            <label for="select-position" class="form-label">Posición</label>
            <select id="select-position" class="form-select">
              <option value="TODAS">TODAS</option>
              ${positions.map(p => `<option value="${p.nombre}">${p.nombre}</option>`).join('')}
            </select>
          </div>
          <div class="col-md-3">
            <label for="select-expert" class="form-label">Experto</label>
            <select id="select-expert" class="form-select"></select>
          </div>
          <div class="col-md-2">
            <label for="select-status" class="form-label">Status</label>
            <select id="select-status" class="form-select">
              <option value="LIBRE">LIBRE</option>
              <option value="TODOS">TODOS</option>
            </select>
          </div>
          <div class="col-md-2">
            <label for="input-bye" class="form-label">Bye condición</label>
            <input type="number" class="form-control" id="input-bye" placeholder="0">
          </div>
          <div class="col-md-2 d-flex align-items-end">
            <div class="form-check mt-2">
              <input class="form-check-input" type="checkbox" id="chk-sleeperADP">
              <label class="form-check-label" for="chk-sleeperADP">Sleeper ADP</label>
            </div>
          </div>
        </form>

        <div class="d-flex flex-wrap gap-3 mb-2">
          <div id="ranks-updated-label" class="text-start"></div>
          <div id="adp-updated-label" class="text-start"></div>
        </div>

        <!-- Controls para cards (búsqueda + paginado) -->
        <div id="cards-controls" class="mb-2">
          <input id="search-input" class="form-control form-control-sm" placeholder="Buscar jugador, equipo, posición..." style="min-width:220px;">
          <div class="flex-right">
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
              <select id="sort-by" class="form-select form-select-sm ms-1" style="width:auto; display:inline-block;">
                <option value="rank">Rank ↑</option>
                <option value="priorityScore">Priority Score ↓</option>
                <option value="projection">Proyección ↓</option>
                <option value="shark" selected>SharkScore 🦈</option>
              </select>
            </label>
          </div>
        </div>

        <div class="mb-3" id="draft-summary"></div>
        <div id="draft-cards" class="mb-2"></div>

        <div class="d-flex justify-content-between align-items-center mt-3">
          <div id="cards-info" class="text-muted small"></div>
          <div id="pagination" class="pagination-controls"></div>
        </div>
      </div>
    </div>
  `;

  // =============================
  // DOM refs
  // =============================
  const statusSelect = document.getElementById('select-status');
  const leagueSelect = document.getElementById('select-league');
  const positionSelect = document.getElementById('select-position');
  const expertSelect = document.getElementById('select-expert');
  const byeInput = document.getElementById('input-bye');
  const sleeperADPCheckbox = document.getElementById('chk-sleeperADP');
  const cardsContainer = document.getElementById('draft-cards');
  const btnUpdate = document.getElementById('btn-update-draft');
  const bestPickWrap = document.getElementById('best-pick');           // ✅ NUEVO
  const bestPickBody = document.getElementById('best-pick-body');      // ✅ NUEVO
  const needsPanel = document.getElementById('needs-panel');           // ✅ NUEVO
  const needsBody = document.getElementById('needs-body');             // ✅ NUEVO
  const queuePill = document.getElementById('queue-pill');             // ✅ NUEVO
  const queueItems = document.getElementById('queue-items');           // ✅ NUEVO
  const clearQueueBtn = document.getElementById('btn-clear-queue');    // ✅ NUEVO

  const searchInput = document.getElementById('search-input');
  const pageSizeSel = document.getElementById('page-size');
  const sortBySel = document.getElementById('sort-by');
  const paginationEl = document.getElementById('pagination');
  const cardsInfo = document.getElementById('cards-info');

  // Estado
  let draftData = [];
  let filtered = [];
  let currentPage = 1;
  let pageSize = Number(pageSizeSel.value) || 12;
  let searchQuery = '';
  let sortBy = sortBySel.value || 'shark';

  // Restaurar filtros guardados
  const savedStatus = localStorage.getItem('draftStatusFilter');
  const savedLeague = localStorage.getItem('draftLeague');
  const savedExpert = localStorage.getItem('draftExpert');
  const savedPosition = localStorage.getItem('draftPosition');
  const savedSleeperADP = localStorage.getItem('draftSleeperADP');

  if (savedStatus) statusSelect.value = savedStatus;
  if (savedPosition) positionSelect.value = savedPosition;
  if (savedSleeperADP) sleeperADPCheckbox.checked = savedSleeperADP === 'true';
  // Forzar SharkScore como default si no hay preferencia guardada
  if (!localStorage.getItem('draftSortBy')) {
    sortBy = 'shark'; sortBySel.value = 'shark';
  }

  // =============================
  // Utilities
  // =============================
  function debounce(fn, wait = 200) { let t; return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), wait); }; }
  const safeNum = (v, decimals = 2) => (typeof v === 'number' && Number.isFinite(v)) ? Number(v.toFixed(decimals)) : (Number.isFinite(+v) ? Number(Number(v).toFixed(decimals)) : '');
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function getHeatColor(value, min, max) {
    const v = Number(value); if (!Number.isFinite(v) || max === min) return '#888';
    const ratio = clamp((v - min) / (max - min), 0, 1);
    const r = Math.floor(255 * (1 - ratio)); const g = Math.floor(255 * ratio);
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
  function getContrastTextColor(hex) { hex = hex.replace('#', ''); if (hex.length === 3) hex = hex.split('').map(c => c + c).join(''); const r = parseInt(hex.substr(0, 2), 16); const g = parseInt(hex.substr(2, 2), 16); const b = parseInt(hex.substr(4, 2), 16); const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255; return luminance > 0.6 ? '#000' : '#fff'; }
  function getPositionBadge(pos) { const bg = getPositionColor(pos); const textColor = getContrastTextColor(bg); return `<span class="badge" style="background:${bg};color:${textColor};">${pos ?? ''}</span>`; }

  // Helper: detectar status "libre" de forma tolerante
  function isFreeStatus(s) {
    const t = (s ?? '').toString().trim().toLowerCase();
    if (!t) return true;
    return ['libre', 'free', 'free agent', 'fa', 'available', 'waiver', 'waivers', 'waiver wire', 'waiver-wire', 'wa'].includes(t);
  }

  function comparePlayers(a, b) {
    if (sortBy === 'rank') {
      const ra = Number(a.rank), rb = Number(b.rank);
      return (Number.isFinite(ra) ? ra : Number.MAX_SAFE_INTEGER) - (Number.isFinite(rb) ? rb : Number.MAX_SAFE_INTEGER);
    } else if (sortBy === 'priorityScore') {
      const pa = Number(a.priorityScore), pb = Number(b.priorityScore);
      return (Number.isFinite(pb) ? pb : -Infinity) - (Number.isFinite(pa) ? pa : -Infinity);
    } else if (sortBy === 'projection') {
      const pa = Number(a.projection), pb = Number(b.projection);
      return (Number.isFinite(pb) ? pb : -Infinity) - (Number.isFinite(pa) ? pa : -Infinity);
    }
    return 0;
  }

  // Normaliza números
  function normalizePlayers(arr) {
    const toNum = (v) => (Number.isFinite(+v) ? +v : null);
    return arr.map(p => ({
      ...p,
      rank: toNum(p.rank),
      projection: toNum(p.projection),
      vor: toNum(p.vor),
      adjustedVOR: toNum(p.adjustedVOR),
      dropoff: toNum(p.dropoff),
      priorityScore: toNum(p.priorityScore),
      boomRate: toNum(p.boomRate),
      bustRate: toNum(p.bustRate),
      adpValue: toNum(p.adpValue),
      adp_rank: toNum(p.adp_rank ?? p.adpRank),
      tier_global: toNum(p.tier_global),
      tier_pos: toNum(p.tier_pos),
      volatility: toNum(p.volatility),
      consistency: toNum(p.consistency),
      stealScore: toNum(p.stealScore)
    }));
  }

  // ====== Shark helpers que ya usas ======
  function _rangeFrom(arr, pick) { const vals = arr.map(pick).map(Number).filter(Number.isFinite); if (!vals.length) return [0, 1]; return [Math.min(...vals), Math.max(...vals)]; }
  function _scale01(v, [min, max], def = 0) { const x = Number(v); if (!Number.isFinite(x)) return def; if (max <= min) return 0.5; return (x - min) / (max - min); }
  function _buildSharkRanges(source) { const arr = source && source.length ? source : []; return { rank: _rangeFrom(arr, p => p.rank), adjustedVOR: _rangeFrom(arr, p => p.adjustedVOR), projection: _rangeFrom(arr, p => p.projection), valueOverADP: _rangeFrom(arr, p => p.valueOverADP), stealScore: _rangeFrom(arr, p => p.stealScore), volatility: _rangeFrom(arr, p => p.volatility), tier_global: _rangeFrom(arr, p => p.tier_global), }; }
  function computeSharkScore(p, R) { const rnkN = _scale01(p.rank, R.rank, 1); const adjVN = _scale01(p.adjustedVOR, R.adjustedVOR, 0); const projN = _scale01(p.projection, R.projection, 0); const voaN = _scale01(p.valueOverADP, R.valueOverADP, 0); const stealN = _scale01(p.stealScore, R.stealScore, 0); const boomN = Math.max(0, Math.min(1, Number(p.boomRate) / 100)); const bustN = Math.max(0, Math.min(1, Number(p.bustRate) / 100)); const consN = Math.max(0, Math.min(1, Number(p.consistency) / 100)); const volN = _scale01(p.volatility, R.volatility, 0.5); const tierInvN = 1 - _scale01(p.tier_global, R.tier_global, 1); const anchor = (1 - rnkN); const valueEdge = voaN * (0.4 + 0.6 * anchor); let score = 0.45 * anchor + 0.20 * adjVN + 0.10 * projN + 0.08 * valueEdge + 0.07 * boomN + 0.05 * consN + 0.03 * tierInvN + 0.02 * stealN - 0.10 * bustN - 0.05 * volN; if (Number.isFinite(p.rank) && p.rank > 100) score -= 0.0025 * (p.rank - 100); return score; }

  // =============================
  // Queue local (por liga)
  // =============================
  const QKEY = (leagueId) => `draftQueue:${leagueId || 'default'}`;
  function getQueue(leagueId) { try { return JSON.parse(localStorage.getItem(QKEY(leagueId)) || '[]'); } catch { return []; } }
  function setQueue(leagueId, arr) { localStorage.setItem(QKEY(leagueId), JSON.stringify(arr || [])); renderQueuePill(leagueId); }
  function toggleQueue(leagueId, player) {
    const id = player.id || player.player_id || player.slug || player.nombre;
    if (!id) return;
    const q = getQueue(leagueId);
    const idx = q.findIndex(x => x.id === id);
    if (idx >= 0) { q.splice(idx, 1); }
    else { q.push({ id, nombre: player.nombre, team: player.team, position: player.position }); }
    setQueue(leagueId, q);
  }
  function isInQueue(leagueId, player) { const id = player.id || player.player_id || player.slug || player.nombre; return getQueue(leagueId).some(x => x.id === id); }
  function renderQueuePill(leagueId) {
    const q = getQueue(leagueId);
    if (!q.length) { queuePill.classList.add('d-none'); queueItems.innerHTML=''; return; }
    queuePill.classList.remove('d-none');
    queueItems.innerHTML = q.slice(-6).map(x => `<span class="q-item">${x.nombre} <small class="text-muted">(${x.position})</small></span>`).join('');
  }
  clearQueueBtn.addEventListener('click', () => {
    const leagueId = leagueSelect.value || 'default';
    setQueue(leagueId, []);
  });

  // =============================
  // Best Pick + Needs
  // =============================
  function renderBestPick(players, params) {
    if (!players?.length) { bestPickWrap.classList.add('d-none'); bestPickBody.innerHTML = ''; return; }
    const base = filtered.length ? filtered : players;
    const R = _buildSharkRanges(base);
    const candidates = base.slice(0, 60);
    candidates.forEach(p => p._shark = computeSharkScore(p, R));
    const best = candidates.sort((a,b) => (b._shark ?? -Infinity) - (a._shark ?? -Infinity))[0];
    if (!best) { bestPickWrap.classList.add('d-none'); bestPickBody.innerHTML = ''; return; }

    const tierBreak = (Number(best.dropoff) || 0) >= 0.9 || (best.tier_pos && best.tier_pos_label && /Tier\s*1/.test(best.tier_pos_label));
    const runHint = tierBreak ? `<span class="badge bg-danger"><i class="bi bi-exclamation-triangle-fill"></i> Tier pressure</span>` : '';
    const adpTxt = (Number.isFinite(best.adp_rank) && Number.isFinite(best.rank)) ? `ADP #${best.adp_rank} vs Rank #${best.rank}` : (best.adpValue ? `ADP ${best.adpValue}` : '');
    const posBadge = getPositionBadge(best.position);
    const heat = (v) => `<span class="badge" style="background:${getHeatColor(v, -1, 1)};color:#fff;">${safeNum(v, 2)}</span>`;

    const leagueId = leagueSelect.value || 'default';
    const starred = isInQueue(leagueId, best) ? 'active' : '';
    const starTitle = starred ? 'Quitar de cola' : 'Añadir a cola';

    bestPickBody.innerHTML = `
      <div class="d-flex flex-column gap-2">
        <div class="d-flex align-items-center justify-content-between gap-2">
          <div class="d-flex align-items-center gap-2">
            ${posBadge}
            <div>
              <div style="font-weight:700; font-size:1.05rem;">${best.nombre ?? ''}</div>
              <div class="text-muted small">${best.team ?? ''} ${best.status ? '· ' + best.status : ''}</div>
            </div>
          </div>
          <button class="star-btn ${starred}" id="bp-star" title="${starTitle}">
            <i class="bi ${starred ? 'bi-star-fill text-warning' : 'bi-star'}"></i>
          </button>
        </div>
        <div class="meta">
          <span class="kv"><i class="bi bi-trophy"></i> Rank ${best.rank ?? ''}</span>
          <span class="kv"><i class="bi bi-bar-chart"></i> ${adpTxt}</span>
          <span class="kv"><i class="bi bi-activity"></i> SharkScore ${heat(best._shark ?? 0)}</span>
          <span class="kv"><i class="bi bi-layers"></i> Adj VOR ${safeNum(best.adjustedVOR)}</span>
          ${runHint}
        </div>
        ${(best.valueTag || (best.riskTags && best.riskTags.length)) ? `
          <div class="d-flex flex-wrap gap-2">
            ${best.valueTag ? `<span class="badge bg-success">${best.valueTag}</span>` : ''}
            ${(best.riskTags||[]).map(t => `<span class="badge bg-warning text-dark">${t}</span>`).join('')}
          </div>` : ''}
      </div>
    `;

    document.getElementById('bp-star').onclick = () => {
      toggleQueue(leagueId, best);
      renderBestPick(players, params);
    };

    bestPickWrap.classList.remove('d-none');
  }

  function renderNeeds(coach) {
    if (!coach?.rosterNeeds || typeof coach.rosterNeeds !== 'object') {
      needsPanel.classList.add('d-none'); needsBody.innerHTML=''; return;
    }
    const needs = coach.rosterNeeds; // { QB: 1, RB: 2, ... } esperado
    const maxNeed = Math.max(1, ...Object.values(needs).map(n => Number(n) || 0));
    const entries = Object.entries(needs).sort((a,b) => (b[1]||0) - (a[1]||0));
    needsBody.innerHTML = entries.map(([pos, val]) => {
      const pct = clamp((Number(val)||0) / maxNeed, 0, 1) * 100;
      const badge = getPositionBadge(pos);
      return `
        <div class="need-item">
          <div class="d-flex align-items-center gap-2">${badge}<strong>${pos}</strong></div>
          <div class="bar"><div style="width:${pct}%"></div></div>
          <span class="badge bg-secondary">${val}</span>
        </div>
      `;
    }).join('');
    needsPanel.classList.remove('d-none');
  }

  // =============================
  // Render summary & cards & paging
  // =============================
  function renderSummary(players) {
    const summary = { tiers: {}, steals: 0, risks: 0 };
    players.forEach(p => {
      const tierLabel = p.tier_global_label || 'Sin tier';
      summary.tiers[tierLabel] = (summary.tiers[tierLabel] || 0) + 1;
      if (p.valueTag === '💎 Steal') summary.steals++;
      if (p.riskTags?.length) summary.risks++;
    });

    const container = document.getElementById('draft-summary');
    container.innerHTML = `
      <div class="d-flex gap-3 flex-wrap">
        ${Object.entries(summary.tiers).map(([tier, count]) => `<span class="badge bg-info">${tier}: ${count}</span>`).join('')}
        <span class="badge bg-success">Steals: ${summary.steals}</span>
        <span class="badge bg-warning text-dark">Riesgos: ${summary.risks}</span>
      </div>
    `;
  }

  function updateCardsForPage(pageIndex = 1) {
    currentPage = Math.max(1, Math.min(pageIndex, Math.ceil(filtered.length / pageSize) || 1));
    const start = (currentPage - 1) * pageSize;
    const pagePlayers = filtered.slice(start, start + pageSize);

    const prios = filtered.map(p => Number(p.priorityScore)).filter(Number.isFinite);
    const maxProj = Math.max(...filtered.map(p => Number(p.projection) || 0), 0) || 1;
    const minPrio = prios.length ? Math.min(...prios) : 0;
    const maxPrio = prios.length ? Math.max(...prios) : 1;

    if (!pagePlayers.length) {
      cardsContainer.innerHTML = `<div class="text-center text-muted">Sin jugadores.</div>`;
    } else {
      const leagueId = leagueSelect.value || 'default';
      cardsContainer.innerHTML = `
        <div class="row g-2">
          ${pagePlayers.map(p => {
            const projPct = Math.min(100, (Number(p.projection || 0) / maxProj) * 100);
            const prioStyle = `background-color:${getHeatColor(p.priorityScore, minPrio, maxPrio)};color:#fff;padding:0 6px;border-radius:6px;font-weight:700;display:inline-block;`;
            const risk = (p.riskTags || []).join(', ');
            const starred = isInQueue(leagueId, p);
            const starTitle = starred ? 'Quitar de cola' : 'Añadir a cola';
            const adpTxt = (Number.isFinite(p.adp_rank) && Number.isFinite(p.rank))
              ? `ADP #${p.adp_rank} vs Rank #${p.rank}`
              : (p.adpValue ? `ADP ${p.adpValue}` : '');

            return `
              <div class="col-12 col-md-4 col-lg-3">
                <div class="draft-card">
                  <div class="title-row">
                    <div class="player">${p.nombre ?? ''}</div>
                    <div class="d-flex align-items-center gap-2">
                      <button class="star-btn ${starred ? 'active' : ''}" data-star='1' data-id="${p.id || p.player_id || p.slug || p.nombre}" title="${starTitle}">
                        <i class="bi ${starred ? 'bi-star-fill text-warning' : 'bi-star'}"></i>
                      </button>
                      <span class="badge" style="${prioStyle}">Prio: ${p.priorityScore ?? ''}</span>
                    </div>
                  </div>
                  <div class="meta mb-2">
                    <span class="kv">${getPositionBadge(p.position)}</span>
                    <span class="kv"><i class="bi bi-shield"></i> ${p.team ?? ''}</span>
                    <span class="kv"><i class="bi bi-calendar2-x"></i> Bye ${p.bye ?? ''}</span>
                    <span class="kv"><i class="bi bi-trophy"></i> Rank ${p.rank ?? ''}</span>
                    <span class="kv"><i class="bi bi-person-check"></i> ${p.status ?? ''}</span>
                    <span class="kv"><i class="bi bi-diagram-3"></i> Ronda ${p.adpRound ?? ''}</span>
                    <span class="kv"><i class="bi bi-bar-chart"></i> ${adpTxt}</span>
                  </div>
                  <div class="mb-2">
                    <div class="small mb-1">Proyección</div>
                    <div class="progress"><div class="progress-bar" style="width:${projPct}%"></div></div>
                  </div>
                  <div class="meta">
                    <span class="kv"><strong>VOR:</strong> ${safeNum(p.vor)}</span>
                    <span class="kv"><strong>Adj VOR:</strong> ${safeNum(p.adjustedVOR)}</span>
                    <span class="kv"><strong>Drop:</strong> ${safeNum(p.dropoff)}</span>
                    <span class="kv"><strong>Val/ADP:</strong> ${safeNum(p.valueOverADP)}</span>
                  </div>
                  <div class="mt-2 d-flex flex-wrap gap-2">
                    ${p.valueTag ? `<span class="badge bg-success">${p.valueTag}</span>` : ''}
                    ${risk ? `<span class="badge bg-warning text-dark">${risk}</span>` : ''}
                    ${p.tier_global_label ? `<span class="badge bg-danger">${p.tier_global ?? ''} ${p.tier_global_label}</span>` : ''}
                    ${p.tier_pos_label ? `<span class="badge bg-primary">${p.tier_pos ?? ''} ${p.tier_pos_label}</span>` : ''}
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;

      // Wire stars
      cardsContainer.querySelectorAll('[data-star="1"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const id = e.currentTarget.getAttribute('data-id');
          const p = pagePlayers.find(x => (x.id || x.player_id || x.slug || x.nombre) == id);
          if (p) { toggleQueue(leagueSelect.value || 'default', p); updateCardsForPage(currentPage); }
        });
      });
    }

    renderSummary(filtered);
    renderPagination();
    cardsInfo.textContent = `Mostrando ${filtered.length ? (start + 1) : 0}-${Math.min(start + pageSize, filtered.length)} de ${filtered.length} jugadores`;
    // Actualiza BestPick cada cambio de página (sobre conjunto filtrado)
    renderBestPick(filtered, /*params*/ null);
  }

  function renderPagination() {
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const firstDisabled = currentPage === 1 ? 'disabled' : '';
    const lastDisabled = currentPage === totalPages ? 'disabled' : '';

    paginationEl.innerHTML = `
      <button class="page-btn" id="btn-first" ${firstDisabled} title="Primera">«</button>
      <button class="page-btn" id="btn-prev" ${firstDisabled} title="Anterior">‹</button>
      <div style="padding:0 .6rem">Página <strong>${currentPage}</strong> / ${totalPages}</div>
      <button class="page-btn" id="btn-next" ${lastDisabled} title="Siguiente">›</button>
      <button class="page-btn" id="btn-last" ${lastDisabled} title="Última">»</button>
    `;

    const btnFirst = document.getElementById('btn-first');
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    const btnLast = document.getElementById('btn-last');

    btnFirst?.addEventListener('click', () => { if (currentPage !== 1) updateCardsForPage(1); });
    btnPrev?.addEventListener('click', () => { if (currentPage > 1) updateCardsForPage(currentPage - 1); });
    btnNext?.addEventListener('click', () => { if (currentPage < totalPages) updateCardsForPage(currentPage + 1); });
    btnLast?.addEventListener('click', () => { if (currentPage !== totalPages) updateCardsForPage(totalPages); });
  }

  // =============================
  // Filtrado local
  // =============================
  function applyFiltersAndSort() {
    const statusFilter = statusSelect.value || '';
    const posFilter = positionSelect.value;
    const byeCondition = Number(byeInput.value) || 0;
    const q = (searchQuery || '').trim().toLowerCase();

    filtered = draftData.filter(p => {
      if (statusFilter && statusFilter !== 'TODOS') {
        if (statusFilter === 'LIBRE') {
          if (!isFreeStatus(p.status)) return false;
        } else {
          if ((p.status || '').toUpperCase() !== statusFilter.toUpperCase()) return false;
        }
      }
      if (posFilter && posFilter !== '' && posFilter !== 'TODAS') {
        if ((p.position || '').toLowerCase() !== posFilter.toLowerCase()) return false;
      }
      if (byeCondition > 0 && (Number(p.bye) || 0) > byeCondition) return false;

      if (q) {
        const haystack = [
          p.nombre, p.team, p.position, p.valueTag, p.tier_global_label, p.tier_pos_label, ...(p.riskTags || [])
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    if (sortBy === 'shark') {
      const base = filtered.length ? filtered : draftData;
      const R = _buildSharkRanges(base);
      filtered.forEach(p => { p._shark = computeSharkScore(p, R); });
      filtered.sort((a, b) => (b._shark ?? -Infinity) - (a._shark ?? -Infinity));
    } else {
      filtered.sort(comparePlayers);
    }

    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (currentPage > totalPages) currentPage = 1;

    updateCardsForPage(currentPage);
  }

  // =============================
  // Carga de datos
  // =============================
  async function loadDraftData() {
    try {
      const leagueId = (leagueSelect.value || '').toString().trim();
      const posRaw = (positionSelect.value || 'TODAS').toString().trim();
      const position = posRaw === '' ? 'TODAS' : posRaw;
      const byeCondition = Number(byeInput.value || 0);

      const expertVal = (document.querySelector('#select-expert')?.tomselect?.getValue?.() ?? expertSelect.value ?? '');
      let idExpert = (Array.isArray(expertVal) ? expertVal[0] : expertVal || '').toString().trim();
      const selectedOption = expertSelect.selectedOptions?.[0];
      if (selectedOption?.dataset?.id) idExpert = selectedOption.dataset.id.toString().trim();

      const sleeperADP = !!sleeperADPCheckbox.checked;

      if (!leagueId || !idExpert) {
        showError('Selecciona una liga y un experto');
        return;
      }

      showLoadingBar('Actualizando draft', 'Descargando datos más recientes...');
      const res = await fetchDraftData(leagueId, position, byeCondition, idExpert, sleeperADP);
      Swal.close();

      const players = res?.players || res?.data || [];
      const params = res?.params || null;
      const coach = res?.coach || null;

      if (!players || !players.length) {
        draftData = []; filtered = [];
        updateCardsForPage(1);
        showError('No se encontraron jugadores.');
        return;
      }

      draftData = normalizePlayers(players);
      currentPage = 1;
      applyFiltersAndSort();

      // Meta labels
      if (params?.ranks_published) {
        const fecha = new Date(params.ranks_published);
        document.getElementById('ranks-updated-label').innerHTML = `
          <div class="px-3 py-1 small rounded-pill shadow-sm"
               style="background-color: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border);">
            <i class="bi bi-calendar-check-fill text-success"></i>
            Ranks actualizados: ${fecha.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
          </div>`;
      } else document.getElementById('ranks-updated-label').innerHTML = '';

      if (params?.ADPdate) {
        const adpDate = new Date(params.ADPdate);
        document.getElementById('adp-updated-label').innerHTML = `
          <div class="px-3 py-1 small rounded-pill shadow-sm"
               style="background-color: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border);">
            <i class="bi bi-clock-history text-warning"></i>
            ADP actualizado: ${adpDate.toLocaleDateString('es-MX', { dateStyle: 'medium' })}
          </div>`;
      } else document.getElementById('adp-updated-label').innerHTML = '';

      // Render BestPick y Needs
      renderBestPick(draftData, params);
      renderNeeds(coach);

      // Actualizar queue pill
      renderQueuePill(leagueId);
    } catch (err) {
      Swal.close();
      console.error('Error en loadDraftData:', err);
      showError('Error al actualizar draft: ' + (err?.message || err));
    }
  }

  // =============================
  // Init selects (Expert y Ligas por usuario via apiUsers)
  // =============================
  let expertTS = null;

  // Expertos (mantiene tu helper)
  try {
    expertTS = await renderExpertSelect('#select-expert', {
      plugins: ['dropdown_input'],
      dropdownInput: false,
      create: false,
      persist: false,
      onChange() {
        try { localStorage.setItem('draftExpert', this.getValue?.() || ''); } catch(e) {}
        this?.blur?.();
        if (leagueSelect.value) loadDraftData();
      }
    });
  } catch (e) {
    await renderExpertSelect('#select-expert', { plugins: ['dropdown_input'], dropdownInput: false, create: false, persist: false });
  }
  if (!expertTS && document.querySelector('#select-expert')?.tomselect) expertTS = document.querySelector('#select-expert').tomselect;

  // Ligas por usuario (apiUsers.js)  ✅ NUEVO
  async function populateLeaguesFromUser() {
    try {
      const accessToken = await getAccessTokenFromClient().catch(() => null);
      const userId = await getUserIdFromClient().catch(() => null);

      if (!userId) {
        leagueSelect.innerHTML = '<option value="">Inicia sesión para ver tus ligas</option>';
        return;
      }

      const leagues = await fetchManualLeaguesByUser(userId, accessToken);
      // Esperamos shape tipo: [{ league_id, name, draft_id, total_rosters }, ...]
      leagueSelect.innerHTML = leagues.length
        ? leagues.map(l => `<option value="${l.league_id}">${l.name || l.league_name || ('Liga ' + l.league_id)}</option>`).join('')
        : '<option value="">(Sin ligas)</option>';

      // Restaurar guardado si existe
      if (savedLeague && leagues.some(l => String(l.league_id) === String(savedLeague))) {
        leagueSelect.value = savedLeague;
      }

      // Cargar inicial si hay experto ya elegido
      if ((expertSelect.value || expertTS?.getValue?.()) && leagueSelect.value) {
        loadDraftData();
      }
    } catch (e) {
      console.error('No se pudieron cargar ligas del usuario:', e);
      leagueSelect.innerHTML = '<option value="">(Error cargando ligas)</option>';
    }
  }

  await populateLeaguesFromUser();

  // Aplica experto guardado
  function applySavedValue(selectEl, tsInstance, savedValue) {
    if (!savedValue) return;
    try {
      if (tsInstance && typeof tsInstance.setValue === 'function') {
        tsInstance.setValue(savedValue);
        tsInstance.blur?.();
      } else if (selectEl && selectEl.tomselect && typeof selectEl.tomselect.setValue === 'function') {
        selectEl.tomselect.setValue(savedValue);
        selectEl.tomselect.blur?.();
      } else if (selectEl) {
        selectEl.value = savedValue;
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        selectEl.blur?.();
      }
    } catch {
      if (selectEl) {
        selectEl.value = savedValue;
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }
  applySavedValue(expertSelect, expertTS, savedExpert);

  // =============================
  // Eventos UI
  // =============================
  statusSelect.addEventListener('change', () => { localStorage.setItem('draftStatusFilter', statusSelect.value); applyFiltersAndSort(); });
  positionSelect.addEventListener('change', () => { localStorage.setItem('draftPosition', positionSelect.value); applyFiltersAndSort(); });
  byeInput.addEventListener('input', debounce(() => applyFiltersAndSort(), 200));
  sleeperADPCheckbox.addEventListener('change', () => { localStorage.setItem('draftSleeperADP', sleeperADPCheckbox.checked); loadDraftData(); });

  pageSizeSel.addEventListener('change', () => {
    pageSize = Number(pageSizeSel.value) || 12; currentPage = 1; updateCardsForPage(currentPage);
  });

  sortBySel.addEventListener('change', () => {
    sortBy = sortBySel.value; localStorage.setItem('draftSortBy', sortBy); applyFiltersAndSort();
  });

  searchInput.addEventListener('input', debounce((e) => {
    searchQuery = e.target.value || ''; currentPage = 1; applyFiltersAndSort();
  }, 250));

  btnUpdate.addEventListener('click', loadDraftData);

  expertSelect.addEventListener('change', () => { localStorage.setItem('draftExpert', expertSelect.value); loadDraftData(); });
  leagueSelect.addEventListener('change', () => { localStorage.setItem('draftLeague', leagueSelect.value); loadDraftData(); renderQueuePill(leagueSelect.value); });

  // Render inicial vacío
  filtered = []; updateCardsForPage(1);

  window.addEventListener('resize', () => { /* hook responsive si lo necesitas */ });
}
