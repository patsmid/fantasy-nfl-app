import { fetchDraftData } from '../api.js';
import { positions } from '../../components/constants.js';
import { showError, showLoadingBar } from '../../components/alerts.js';
import { renderExpertSelect } from '../../components/selectExperts.js';
import { renderLeagueSelect } from '../../components/selectLeagues.js';

export default async function renderDraftView() {
  const content = document.getElementById('content-container');

  content.innerHTML = `
    <style>
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

      /* Controls row */
      #cards-controls { display:flex; gap:.5rem; flex-wrap:wrap; align-items:center; margin-bottom:.75rem; }
      #cards-controls .flex-right { margin-left:auto; display:flex; gap:.5rem; align-items:center; }

      .pagination-controls { display:flex; gap:.4rem; align-items:center; }
      .page-btn { min-width:36px; text-align:center; padding:.2rem .5rem; cursor:pointer; border-radius:.35rem; border:1px solid rgba(255,255,255,.06); background:transparent; color:inherit; }
      .page-btn[disabled] { opacity:.45; cursor:not-allowed; }

      /* Responsive grid tweaks */
      @media(min-width:1200px) {
        #draft-cards .col-lg-3 { max-width: 23%; flex: 0 0 23%; }
      }
    </style>

    <div class="card border-0 shadow-sm rounded flock-card">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h4 class="m-0 d-flex align-items-center gap-2">
            <i class="bi bi-clipboard-data text-info"></i> Draft Inteligente
          </h4>
          <div class="d-flex align-items-center gap-2">
            <button class="btn btn-sm btn-primary" id="btn-update-draft">
              <i class="bi bi-arrow-clockwise"></i> Actualizar Draft
            </button>
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
  let sortBy = sortBySel.value;

  // Restaurar filtros guardados
  const savedStatus = localStorage.getItem('draftStatusFilter');
  const savedLeague = localStorage.getItem('draftLeague');
  const savedExpert = localStorage.getItem('draftExpert');
  const savedPosition = localStorage.getItem('draftPosition');
  const savedSleeperADP = localStorage.getItem('draftSleeperADP');

  if (savedStatus) statusSelect.value = savedStatus;
  if (savedPosition) positionSelect.value = savedPosition;
  if (savedSleeperADP) sleeperADPCheckbox.checked = savedSleeperADP === 'true';

  // =============================
  // Utilities
  // =============================
  function debounce(fn, wait = 200) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  const safeNum = (v, decimals = 2) =>
    (typeof v === 'number' && Number.isFinite(v)) ? Number(v.toFixed(decimals)) : (Number.isFinite(+v) ? Number(Number(v).toFixed(decimals)) : '');

  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

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
      case 'RB': return 'bg-success text-white';
      case 'WR': return 'bg-primary text-white';
      case 'TE': return 'bg-warning text-dark';
      case 'QB': return 'bg-danger text-white';
      default: return 'bg-secondary text-white';
    }
  }
  const getPositionBadge = (pos) => `<span class="badge ${getPositionColor(pos)}">${pos ?? ''}</span>`;

  function comparePlayers(a, b) {
    if (sortBy === 'rank') {
      const ra = Number(a.rank);
      const rb = Number(b.rank);
      return (Number.isFinite(ra) ? ra : Number.MAX_SAFE_INTEGER) - (Number.isFinite(rb) ? rb : Number.MAX_SAFE_INTEGER);
    } else if (sortBy === 'priorityScore') {
      const pa = Number(a.priorityScore);
      const pb = Number(b.priorityScore);
      return (Number.isFinite(pb) ? pb : -Infinity) - (Number.isFinite(pa) ? pa : -Infinity); // desc
    } else if (sortBy === 'projection') {
      const pa = Number(a.projection);
      const pb = Number(b.projection);
      return (Number.isFinite(pb) ? pb : -Infinity) - (Number.isFinite(pa) ? pa : -Infinity); // desc
    }
    return 0;
  }

  // Normaliza números de los jugadores (para sort/metricas)
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
      valueOverADP: toNum(p.valueOverADP),
    }));
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
      cardsContainer.innerHTML = `
        <div class="row g-2">
          ${pagePlayers.map(p => {
            const projPct = Math.min(100, (Number(p.projection || 0) / maxProj) * 100);
            const prioStyle = `background-color:${getHeatColor(p.priorityScore, minPrio, maxPrio)};color:#fff;padding:0 6px;border-radius:6px;font-weight:700;display:inline-block;`;
            const risk = (p.riskTags || []).join(', ');
            return `
              <div class="col-12 col-md-4 col-lg-3">
                <div class="draft-card">
                  <div class="title-row">
                    <div class="player">${p.nombre ?? ''}</div>
                    <span class="badge" style="${prioStyle}">Prio: ${p.priorityScore ?? ''}</span>
                  </div>
                  <div class="meta mb-2">
                    <span class="kv">${getPositionBadge(p.position)}</span>
                    <span class="kv"><i class="bi bi-shield"></i> ${p.team ?? ''}</span>
                    <span class="kv"><i class="bi bi-calendar2-x"></i> Bye ${p.bye ?? ''}</span>
                    <span class="kv"><i class="bi bi-trophy"></i> Rank ${p.rank ?? ''}</span>
                    <span class="kv"><i class="bi bi-person-check"></i> ${p.status ?? ''}</span>
                    <span class="kv"><i class="bi bi-diagram-3"></i> Ronda ${p.adpRound ?? ''}</span>
                    <span class="kv"><i class="bi bi-bar-chart"></i> ADP ${p.adpValue ?? ''}</span>
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
    }

    renderSummary(filtered);
    renderPagination();
    cardsInfo.textContent = `Mostrando ${filtered.length ? (start + 1) : 0}-${Math.min(start + pageSize, filtered.length)} de ${filtered.length} jugadores`;
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
  function isFreeStatus(s) {
    const t = (s ?? '').toString().trim().toLowerCase();
    if (!t) return true;
    return ['libre', 'free', 'free agent', 'fa', 'available', 'waiver', 'waivers', 'waiver wire', 'waiver-wire', 'wa'].includes(t);
  }

  function applyFiltersAndSort() {
    const status = statusSelect.value;
    const posFilter = positionSelect.value;
    const byeCondition = Number(byeInput.value) || 0;
    const q = (searchQuery || '').trim().toLowerCase();

    filtered = draftData.filter(p => {
      // status
      if (status !== 'TODOS') {
        if (!isFreeStatus(p.status)) return false;
      }
      // position
      if (posFilter && posFilter !== '' && posFilter !== 'TODAS') {
        if ((p.position || '').toLowerCase() !== posFilter.toLowerCase()) return false;
      }
      // bye condition (simple >=)
      if (byeCondition > 0 && (Number(p.bye) || 0) > byeCondition) return false;

      // search
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

    filtered.sort(comparePlayers);

    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (currentPage > totalPages) currentPage = 1;

    updateCardsForPage(currentPage);
  }

  // =============================
  // Carga de datos
  // =============================
  async function loadDraftData() {
    try {
      // Lee valores con soporte a TomSelect y fallback
      const leagueId =
        (document.querySelector('#select-league')?.tomselect?.getValue?.() || leagueSelect.value || '').toString().trim();

      const posRaw = (positionSelect.value || 'TODAS').toString().trim();
      const position = posRaw === '' ? 'TODAS' : posRaw;

      const byeCondition = Number(byeInput.value || 0);

      const expertVal = (document.querySelector('#select-expert')?.tomselect?.getValue?.() ?? expertSelect.value ?? '');
      let idExpert = (Array.isArray(expertVal) ? expertVal[0] : expertVal || '').toString().trim();
      // dataset id prioritario si existe
      const selectedOption = expertSelect.selectedOptions?.[0];
      if (selectedOption?.dataset?.id) {
        idExpert = selectedOption.dataset.id.toString().trim();
      }

      const sleeperADP = !!sleeperADPCheckbox.checked;

      if (!leagueId || !idExpert) {
        showError('Selecciona una liga y un experto');
        return;
      }

      showLoadingBar('Actualizando draft', 'Descargando datos más recientes...');
      const { players, params } = await fetchDraftData(leagueId, position, byeCondition, idExpert, sleeperADP);
      Swal.close();

      if (!players || !players.length) {
        draftData = [];
        filtered = [];
        updateCardsForPage(1);
        showError('No se encontraron jugadores.');
        return;
      }

      draftData = normalizePlayers(players);
      currentPage = 1;
      applyFiltersAndSort();

      if (params?.ranks_published) {
        const fecha = new Date(params.ranks_published);
        document.getElementById('ranks-updated-label').innerHTML = `
          <div class="px-3 py-1 small rounded-pill shadow-sm"
               style="background-color: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border);">
            <i class="bi bi-calendar-check-fill text-success"></i>
            Ranks actualizados: ${fecha.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
          </div>`;
      } else {
        document.getElementById('ranks-updated-label').innerHTML = '';
      }

      if (params?.ADPdate) {
        const adpDate = new Date(params.ADPdate);
        document.getElementById('adp-updated-label').innerHTML = `
          <div class="px-3 py-1 small rounded-pill shadow-sm"
               style="background-color: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border);">
            <i class="bi bi-clock-history text-warning"></i>
            ADP actualizado: ${adpDate.toLocaleDateString('es-MX', { dateStyle: 'medium' })}
          </div>`;
      } else {
        document.getElementById('adp-updated-label').innerHTML = '';
      }
    } catch (err) {
      Swal.close();
      console.error('Error en loadDraftData:', err);
      showError('Error al actualizar draft: ' + (err?.message || err));
    }
  }

  // =============================
  // Init selects (TomSelect y fallback)
  // =============================
  let expertTS = null, leagueTS = null;
  try {
    expertTS = await renderExpertSelect('#select-expert', {
      plugins: ['dropdown_input'],
      dropdownInput: false,
      create: false,
      persist: false,
      onChange() {
        try { localStorage.setItem('draftExpert', this.getValue?.() || ''); } catch(e) {}
        loadDraftData();
        if (this && typeof this.blur === 'function') this.blur();
      }
    });
  } catch (e) {
    await renderExpertSelect('#select-expert', { plugins: ['dropdown_input'], dropdownInput: false, create: false, persist: false });
  }

  try {
    leagueTS = await renderLeagueSelect('#select-league', {
      plugins: ['dropdown_input'],
      dropdownInput: false,
      create: false,
      persist: false,
      onChange() {
        try { localStorage.setItem('draftLeague', this.getValue?.() || ''); } catch(e) {}
        loadDraftData();
        if (this && typeof this.blur === 'function') this.blur();
      }
    });
  } catch (e) {
    await renderLeagueSelect('#select-league', { plugins: ['dropdown_input'], dropdownInput: false, create: false, persist: false });
  }

  // Fallback si tomselect no fue devuelto por la función
  if (!expertTS && document.querySelector('#select-expert')?.tomselect) expertTS = document.querySelector('#select-expert').tomselect;
  if (!leagueTS && document.querySelector('#select-league')?.tomselect) leagueTS = document.querySelector('#select-league').tomselect;

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
  applySavedValue(leagueSelect, leagueTS, savedLeague);

  // =============================
  // Eventos UI
  // =============================
  statusSelect.addEventListener('change', () => { localStorage.setItem('draftStatusFilter', statusSelect.value); applyFiltersAndSort(); });
  positionSelect.addEventListener('change', () => { localStorage.setItem('draftPosition', positionSelect.value); applyFiltersAndSort(); });
  byeInput.addEventListener('input', debounce(() => applyFiltersAndSort(), 200));
  sleeperADPCheckbox.addEventListener('change', () => { localStorage.setItem('draftSleeperADP', sleeperADPCheckbox.checked); loadDraftData(); });

  pageSizeSel.addEventListener('change', () => {
    pageSize = Number(pageSizeSel.value) || 12;
    currentPage = 1;
    updateCardsForPage(currentPage);
  });

  sortBySel.addEventListener('change', () => {
    sortBy = sortBySel.value;
    applyFiltersAndSort();
  });

  searchInput.addEventListener('input', debounce((e) => {
    searchQuery = e.target.value || '';
    currentPage = 1;
    applyFiltersAndSort();
  }, 250));

  btnUpdate.addEventListener('click', loadDraftData);

  // expert/league fallback native change -> load
  expertSelect.addEventListener('change', () => { localStorage.setItem('draftExpert', expertSelect.value); loadDraftData(); });
  leagueSelect.addEventListener('change', () => { localStorage.setItem('draftLeague', leagueSelect.value); loadDraftData(); });

  // Init: si hay liga y experto guardados, cargar
  if (savedLeague && savedExpert) loadDraftData();

  // Render inicial vacío
  filtered = [];
  updateCardsForPage(1);

  window.addEventListener('resize', () => {
    // Hook responsive si lo necesitas
  });
}
