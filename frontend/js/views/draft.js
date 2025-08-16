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
      #draft-cards .title-row { display:flex; align-items:center; justify-content:space-between; gap:.5rem; margin-bottom:.35rem; }
      #draft-cards .player { font-weight:600; font-size:1rem; line-height:1.2; }
      #draft-cards .meta { display:flex; flex-wrap:wrap; gap:.5rem .75rem; font-size:.85rem; opacity:.9; }
      #draft-cards .kv { display:flex; gap:.25rem; align-items:center; }
      #draft-cards .progress { height:10px; background: rgba(255,255,255,.08); }
      #draft-cards .progress-bar { background-color:#0dcaf0; }

      /* Tabla escritorio */
      #draftTable td, #draftTable th { vertical-align: middle; }
      #draftTable .badge { white-space: nowrap; }
      #draftTable .progress { height:12px; min-width:120px; }

      /* Contenedores movidos para controls */
      #dt-controls-top { gap:.5rem; margin-bottom:.5rem; display:none; }
      #dt-pagination-bottom { margin-top:.5rem; display:none; }

      .dt-wrapper-hidden { display:none !important; }
    </style>

    <div class="card border-0 shadow-sm rounded flock-card">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <h4 class="m-0 d-flex align-items-center gap-2">
            <i class="bi bi-clipboard-data text-info"></i> Draft Inteligente
          </h4>

          <div class="d-flex gap-2 align-items-center">
            <button id="btn-view-cards" class="btn btn-sm btn-outline-info">Cards</button>
            <button id="btn-view-table" class="btn btn-sm btn-outline-info">Tabla</button>
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

          <!-- Sleeper ADP -->
          <div class="col-md-2 d-flex align-items-end">
            <div class="form-check mt-2">
              <input class="form-check-input" type="checkbox" id="chk-sleeperADP">
              <label class="form-check-label" for="chk-sleeperADP">Sleeper ADP</label>
            </div>
          </div>
        </form>

        <div class="d-flex flex-wrap gap-3 mb-3">
          <div id="ranks-updated-label" class="text-start"></div>
          <div id="adp-updated-label" class="text-start"></div>
        </div>

        <div id="dt-controls-top" class="d-md-flex justify-content-between align-items-center"></div>

        <div id="draft-summary" class="mb-3"></div>

        <!-- Cards (visible por defecto en móvil; en desktop según vista) -->
        <div id="draft-cards" class="mb-3"></div>

        <div id="dt-pagination-bottom" class="d-md-flex justify-content-between align-items-center"></div>

        <!-- Tabla: solo desktop -->
        <div id="draft-table-wrapper" class="d-none d-md-block">
          <div class="table-responsive">
            <table id="draftTable" class="table table-dark table-hover align-middle w-100">
              <thead class="table-dark">
                <tr>
                  <th>Priority</th>
                  <th>ADP</th>
                  <th>Jugador</th>
                  <th>Posición</th>
                  <th>Equipo</th>
                  <th>Bye</th>
                  <th>Ranking</th>
                  <th>Status</th>
                  <th>Ronda</th>
                  <th>Proyección</th>
                  <th>VOR</th>
                  <th>VOR Ajustado</th>
                  <th>Dropoff</th>
                  <th>Value/ADP</th>
                  <th>Risk Tags</th>
                  <th>Tier Global</th>
                  <th>Tier Posición</th>
                  <!-- índice oculto para mapear a cards -->
                  <th data-hidden-idx>_idx</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  `;

  // DOM refs
  const statusSelect = document.getElementById('select-status');
  const leagueSelect = document.getElementById('select-league');
  const positionSelect = document.getElementById('select-position');
  const expertSelect = document.getElementById('select-expert');
  const byeInput = document.getElementById('input-bye');
  const sleeperADPCheckbox = document.getElementById('chk-sleeperADP');
  const cardsContainer = document.getElementById('draft-cards');
  const dtControlsTop = document.getElementById('dt-controls-top');
  const dtPagBottom = document.getElementById('dt-pagination-bottom');
  const draftTableWrapper = document.getElementById('draft-table-wrapper');
  const btnCards = document.getElementById('btn-view-cards');
  const btnTable = document.getElementById('btn-view-table');

  // State
  let draftData = [];
  let lastFiltered = [];
  let dtInstance = null;
  let dtWrapperEl = null;
  let controlsMounted = false;

  // Restore saved
  const savedStatus = localStorage.getItem('draftStatusFilter');
  const savedLeague = localStorage.getItem('draftLeague');
  const savedExpert = localStorage.getItem('draftExpert');
  const savedPosition = localStorage.getItem('draftPosition');
  const savedSleeperADP = localStorage.getItem('draftSleeperADP');
  const savedView = localStorage.getItem('draftView') || (window.innerWidth < 768 ? 'cards' : 'cards');

  if (savedStatus) statusSelect.value = savedStatus;
  if (savedPosition) positionSelect.value = savedPosition;
  if (savedSleeperADP) sleeperADPCheckbox.checked = savedSleeperADP === 'true';

  // Helper: try to get TomSelect instance from select element
  function getTomInstance(selectEl) {
    if (!selectEl) return null;
    // Common properties used by different wrappers
    if (selectEl.tomselect) return selectEl.tomselect;
    if (selectEl._tomselect) return selectEl._tomselect;
    if (selectEl._selectize) return selectEl._selectize;
    if (selectEl.selectize) return selectEl.selectize;
    // TomSelect may attach on the DOM node via _ts
    if (selectEl._ts) return selectEl._ts;
    return null;
  }

  // Initialize TomSelect via your render helpers. They may return instances; handle both cases.
  let expertTS = null;
  let leagueTS = null;
  try {
    const maybeExpert = await renderExpertSelect('#select-expert', {
      plugins: ['dropdown_input'],
      dropdownInput: false,
      create: false,
      persist: false,
      onChange() { this.blur && this.blur(); } // try to blur
    });
    expertTS = maybeExpert || getTomInstance(expertSelect);
  } catch (e) {
    // fallback: maybe renderExpertSelect does DOM-only
    expertTS = getTomInstance(expertSelect);
  }

  try {
    const maybeLeague = await renderLeagueSelect('#select-league', {
      plugins: ['dropdown_input'],
      dropdownInput: false,
      create: false,
      persist: false,
      onChange() { this.blur && this.blur(); }
    });
    leagueTS = maybeLeague || getTomInstance(leagueSelect);
  } catch (e) {
    leagueTS = getTomInstance(leagueSelect);
  }

  // After TomSelect ready, restore saved values using instance if possible, else set select.value
  function setSelectValue(selectEl, tsInstance, value) {
    if (!value) return;
    try {
      if (tsInstance && typeof tsInstance.setValue === 'function') {
        tsInstance.setValue(value);
      } else if (tsInstance && typeof tsInstance.setValue === 'undefined' && typeof tsInstance.addItem === 'function') {
        // alternative API
        tsInstance.addItem(value);
      } else {
        selectEl.value = value;
        // dispatch change so listeners react
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } catch (err) {
      selectEl.value = value;
      selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  if (savedExpert) setSelectValue(expertSelect, expertTS, savedExpert);
  if (savedLeague) setSelectValue(leagueSelect, leagueTS, savedLeague);

  // If TomSelect instance exposes events, bind to them; otherwise bind to the select change event
  function bindSelectChange(selectEl, tsInstance, handler) {
    try {
      if (tsInstance && typeof tsInstance.on === 'function') {
        tsInstance.on('change', handler);
      }
    } catch (e) {
      // ignore
    }
    // always ensure the native select change is handled
    selectEl.addEventListener('change', handler);
  }

  bindSelectChange(expertSelect, expertTS, () => {
    localStorage.setItem('draftExpert', expertSelect.value || '');
    loadDraftData();
  });
  bindSelectChange(leagueSelect, leagueTS, () => {
    localStorage.setItem('draftLeague', leagueSelect.value || '');
    loadDraftData();
  });

  // Save other filters
  statusSelect.addEventListener('change', () => {
    localStorage.setItem('draftStatusFilter', statusSelect.value);
    refreshUI(draftData);
  });
  positionSelect.addEventListener('change', () => {
    localStorage.setItem('draftPosition', positionSelect.value);
    loadDraftData();
  });
  sleeperADPCheckbox.addEventListener('change', () => {
    localStorage.setItem('draftSleeperADP', sleeperADPCheckbox.checked);
    loadDraftData();
  });
  document.getElementById('btn-update-draft').addEventListener('click', loadDraftData);

  // view toggle
  btnCards.addEventListener('click', () => setView('cards'));
  btnTable.addEventListener('click', () => setView('table'));

  // Utils
  const getHeatColor = (value, min, max) => {
    if (value == null || isNaN(value) || max === min) return '#888';
    const ratio = (value - min) / (max - min);
    const r = Math.floor(255 * (1 - ratio));
    const g = Math.floor(255 * ratio);
    return `rgb(${r},${g},0)`;
  };
  const safeNum = (v, decimals = 2) =>
    (typeof v === 'number' && Number.isFinite(v)) ? Number(v.toFixed(decimals)) : '';

  function renderSummary(players) {
    const summary = { tiers: {}, risks: 0 };
    players.forEach(p => {
      const tierLabel = p.tier_global_label || 'Sin tier';
      summary.tiers[tierLabel] = (summary.tiers[tierLabel] || 0) + 1;
      if (p.riskTags?.length) summary.risks++;
    });
    document.getElementById('draft-summary').innerHTML = `
      <div class="d-flex gap-3 flex-wrap">
        ${Object.entries(summary.tiers).map(([tier, count]) => `<span class="badge bg-info">${tier}: ${count}</span>`).join('')}
        <span class="badge bg-warning text-dark">Riesgos: ${summary.risks}</span>
      </div>
    `;
  }

  // DataTables control mounting (move the nodes once)
  function mountDtControlsOnce() {
    if (controlsMounted) return;
    const $wrap = $('#draftTable').closest('.dataTables_wrapper');
    if (!$wrap.length) return;
    dtWrapperEl = $wrap.get(0);
    const $length = $wrap.find('div.dataTables_length');
    const $filter = $wrap.find('div.dataTables_filter');
    const $info = $wrap.find('div.dataTables_info');
    const $paginate = $wrap.find('div.dataTables_paginate');

    if ($length.length && !dtControlsTop.contains($length[0])) $(dtControlsTop).append($length);
    if ($filter.length && !dtControlsTop.contains($filter[0])) $(dtControlsTop).append($filter);
    if ($info.length && !dtPagBottom.contains($info[0])) $(dtPagBottom).append($info);
    if ($paginate.length && !dtPagBottom.contains($paginate[0])) $(dtPagBottom).append($paginate);

    dtControlsTop.style.display = 'flex';
    dtPagBottom.style.display = 'flex';
    controlsMounted = true;
  }

  // Render cards — shows the array passed (cards per page when using DataTables)
  function updateCards(players) {
    const cont = cardsContainer;
    if (!players || !players.length) {
      cont.innerHTML = `<div class="text-center text-muted">Sin jugadores.</div>`;
      return;
    }
    const maxProj = Math.max(...players.map(p => Number(p.projection) || 0)) || 1;
    cont.innerHTML = `
      <div class="row row-cols-1 row-cols-md-3 row-cols-lg-4 g-2">
        ${players.map(p=>{
          const risk = (p.riskTags || []).join(', ');
          const prio = (p.priorityScore ?? '') + '';
          const projPct = Math.min(100, (Number(p.projection||0)/maxProj)*100);
          return `
            <div class="col">
              <div class="draft-card h-100">
                <div class="title-row">
                  <div class="player">${p.nombre ?? ''}</div>
                  <span class="badge bg-info text-dark">Prio: ${prio}</span>
                </div>
                <div class="meta mb-2">
                  <span class="kv"><span class="badge bg-primary">${p.position ?? ''}</span></span>
                  <span class="kv"><i class="bi bi-shield"></i> ${p.team ?? ''}</span>
                  <span class="kv"><i class="bi bi-calendar2-x"></i> Bye ${p.bye ?? ''}</span>
                  <span class="kv"><i class="bi bi-trophy"></i> Rank ${p.rank ?? ''}</span>
                  <span class="kv"><i class="bi bi-person-check"></i> ${p.status ?? ''}</span>
                  <span class="kv"><i class="bi bi-diagram-3"></i> Ronda ${p.adpRound ?? ''}</span>
                  <span class="kv"><i class="bi bi-bar-chart"></i> ADP: ${p.adpValue ?? '-'}</span>
                </div>
                <div class="mb-2">
                  <div class="small mb-1">Proyección</div>
                  <div class="progress"><div class="progress-bar" style="width:${projPct}%"></div></div>
                </div>
                <div class="meta">
                  <span class="kv"><strong>VOR:</strong> ${safeNum(p.vor)}</span>
                  <span class="kv"><strong>Adj VOR:</strong> ${safeNum(p.adjustedVOR)}</span>
                  <span class="kv"><strong>Drop:</strong> ${p.dropoff ?? ''}</span>
                  <span class="kv"><strong>Val/ADP:</strong> ${safeNum(p.valueOverADP)}</span>
                </div>
                <div class="mt-2 d-flex flex-wrap gap-2">
                  ${risk ? `<span class="badge bg-warning text-dark">${risk}</span>` : ''}
                  ${p.valueTag ? `<span class="badge bg-success">${p.valueTag}</span>` : ''}
                  ${p.tier_global_label ? `<span class="badge bg-danger">${p.tier_global} ${p.tier_global_label}</span>` : ''}
                  ${p.tier_pos_label ? `<span class="badge bg-primary">${p.tier_pos} ${p.tier_pos_label}</span>` : ''}
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // Render cards from DataTables current page/search/order (desktop cards mode)
  function renderCardsFromDataTable() {
    if (!dtInstance) {
      // fallback: show all filtered sorted by rank
      updateCards(lastFiltered.slice().sort((a,b)=>{
        const ra=(a.rank??Infinity), rb=(b.rank??Infinity); return ra-rb;
      }));
      renderSummary(lastFiltered);
      return;
    }
    const idxHidden = $('#draftTable thead th').length - 1;
    const rows = dtInstance.rows({ page: 'current', search: 'applied', order: 'applied' }).data().toArray();
    const pagePlayers = rows.map(r => lastFiltered[Number(r[idxHidden])]).filter(Boolean);
    updateCards(pagePlayers);
    renderSummary(pagePlayers);
  }

  // Update DataTable with filtered dataset. NOTE: stealScore removed entirely.
  function updateTable(filtered) {
    lastFiltered = filtered.slice();
    if (!filtered.length) {
      if ($.fn.dataTable.isDataTable('#draftTable')) {
        dtInstance.clear().draw();
      }
      // show empty cards to mobile
      if (!isDesktop()) updateCards([]);
      return;
    }

    const minPriority = Math.min(...filtered.map(p => Number(p.priorityScore) || 0));
    const maxPriority = Math.max(...filtered.map(p => Number(p.priorityScore) || 0));
    const minVOR = Math.min(...filtered.map(p => Number(p.adjustedVOR) || 0));
    const maxVOR = Math.max(...filtered.map(p => Number(p.adjustedVOR) || 0));
    const maxProj = Math.max(...filtered.map(p => Number(p.projection) || 0)) || 1;

    // Build rows. Last column is index into filtered for mapping back to player.
    const dataSet = filtered.map((p, idx) => [
      `<span style="background-color:${getHeatColor(p.priorityScore, minPriority, maxPriority)};padding:0 6px;border-radius:4px;color:white;font-weight:bold;display:inline-block;">${p.priorityScore ?? ''}</span>`, //0
      p.adpValue ?? '', //1
      p.nombre ?? '', //2
      p.position ?? '', //3
      p.team ?? '', //4
      p.bye ?? '', //5
      p.rank ?? '', //6
      p.status ?? '', //7
      p.adpRound ?? '', //8
      `<div class="progress"><div class="progress-bar" style="width:${Math.min(100,(Number(p.projection||0)/maxProj)*100)}%"></div></div>`, //9 projection
      `<span style="background-color:${getHeatColor(p.vor, minVOR, maxVOR)};padding:0 4px;border-radius:4px;color:white;font-weight:bold;">${safeNum(p.vor)}</span>`, //10
      `<span style="background-color:${getHeatColor(p.adjustedVOR, minVOR, maxVOR)};padding:0 4px;border-radius:4px;color:white;font-weight:bold;">${safeNum(p.adjustedVOR)}</span>`, //11
      p.dropoff ?? '', //12
      safeNum(p.valueOverADP), //13
      (p.riskTags || []).join(', '), //14
      p.valueTag ?? '', //15
      `<span class="badge bg-danger text-light">${p.tier_global ?? ''} ${p.tier_global_label ?? ''}</span>`, //16
      `<span class="badge bg-primary text-light">${p.tier_pos ?? ''} ${p.tier_pos_label ?? ''}</span>`, //17
      String(idx) //18 hidden idx
    ]);

    const idxHidden = $('#draftTable thead th').length - 1; // should be last
    const notOrderable = [9, 14, 15, 16, 17].filter(i => i >= 0 && i <= idxHidden);

    if ($.fn.dataTable.isDataTable('#draftTable')) {
      dtInstance.clear();
      dtInstance.rows.add(dataSet);
      dtInstance.draw(false);
    } else {
      dtInstance = $('#draftTable').DataTable({
        data: dataSet,
        destroy: true,
        scrollX: true,
        autoWidth: false,
        pageLength: 25,
        order: [[6, 'asc']], // order by rank
        dom: 'lfrtip',
        language: { url: '//cdn.datatables.net/plug-ins/2.3.2/i18n/es-MX.json' },
        columnDefs: [
          { targets: notOrderable, orderable: false },
          { targets: notOrderable, className: 'text-nowrap text-center' },
          { targets: [idxHidden], visible: false, searchable: false }
        ],
        rowCallback: function(row, data) {
          const valTag = data[15] || '';
          const tierHtml = data[16] || '';
          const tier = String(tierHtml).toLowerCase();
          $(row).removeClass('tier-elite tier-starter tier-bench tier-steal');
          if (tier.includes('elite')) $(row).addClass('tier-elite');
          else if (tier.includes('starter')) $(row).addClass('tier-starter');
          else if (tier.includes('bench')) $(row).addClass('tier-bench');
          if (String(valTag).includes('💎 Steal')) $(row).addClass('tier-steal');
        },
        initComplete: function() {
          // move controls once
          mountDtControlsOnce();

          // store wrapper for show/hide
          const $wrap = $('#draftTable').closest('.dataTables_wrapper');
          if ($wrap.length) dtWrapperEl = $wrap.get(0);

          // if desktop default view is cards, hide wrapper and render cards for visible page
          if (isDesktop() && (localStorage.getItem('draftView') || savedView) === 'cards') {
            if (dtWrapperEl) dtWrapperEl.classList.add('dt-wrapper-hidden');
            renderCardsFromDataTable();
          }
        }
      });

      // redraw cards on draw
      $('#draftTable').on('draw.dt', () => {
        if (isDesktop() && (localStorage.getItem('draftView') || savedView) === 'cards') {
          renderCardsFromDataTable();
        }
      });
    }

    // If desktop and cards view active, render cards from DataTables page
    if (isDesktop() && (localStorage.getItem('draftView') || savedView) === 'cards') {
      renderCardsFromDataTable();
    }
  }

  function isDesktop() {
    return window.matchMedia('(min-width: 768px)').matches;
  }

  function setView(view) {
    localStorage.setItem('draftView', view);
    // Buttons state
    btnCards.classList.toggle('active', view === 'cards');
    btnTable.classList.toggle('active', view === 'table');

    if (view === 'cards') {
      // show cards, hide table wrapper (wrapper includes controls if not yet moved)
      document.getElementById('draft-cards').classList.remove('d-none');
      if (dtWrapperEl) dtWrapperEl.classList.add('dt-wrapper-hidden');
      else if (draftTableWrapper) draftTableWrapper.classList.add('d-none');
      // render page cards
      renderCardsFromDataTable();
      // ensure top controls visible
      dtControlsTop.style.display = controlsMounted ? 'flex' : 'none';
      dtPagBottom.style.display = controlsMounted ? 'flex' : 'none';
    } else {
      // show table, hide cards
      document.getElementById('draft-cards').classList.add('d-none');
      if (dtWrapperEl) dtWrapperEl.classList.remove('dt-wrapper-hidden');
      else if (draftTableWrapper) draftTableWrapper.classList.remove('d-none');

      // ensure table headers/layout present and adjusted
      if (dtInstance) {
        // ensure thead displayed
        const hdr = dtInstance.table().header();
        if (hdr) $(hdr).css('display', '');
        requestAnimationFrame(() => {
          dtInstance.columns.adjust();
          requestAnimationFrame(() => dtInstance.draw(false));
        });
      }

      dtControlsTop.style.display = controlsMounted ? 'flex' : 'none';
      dtPagBottom.style.display = controlsMounted ? 'flex' : 'none';
    }
  }

  // Refresh UI: apply status filter and update both cards/table depending on device & view
  function refreshUI(data) {
    const statusFilter = statusSelect.value;
    const filtered = data.filter(p => statusFilter === 'TODOS' || (p.status || '').toLowerCase().trim() === 'libre');

    // save lastFiltered
    lastFiltered = filtered.slice();

    renderSummary(filtered);

    // Desktop: use DataTable for paging/search; Mobile: cards show full filtered list
    if (isDesktop()) {
      updateTable(filtered);
      if ((localStorage.getItem('draftView') || savedView) === 'table') setView('table');
      else setView('cards');
    } else {
      // Mobile: show cards (all filtered sorted by rank)
      const sorted = filtered.slice().sort((a,b)=> (a.rank??Infinity)-(b.rank??Infinity));
      updateCards(sorted);
    }
  }

  // Load data
  async function loadDraftData() {
    try {
      const leagueId = leagueSelect.value;
      const position = positionSelect.value;
      const byeCondition = byeInput.value || 0;
      // expertSelect may be a TomSelect wrapper; try to read value from select element
      const selectedOpt = expertSelect && expertSelect.selectedOptions && expertSelect.selectedOptions[0];
      const idExpert = expertSelect.value || (selectedOpt ? selectedOpt.value : '');
      const sleeperADP = sleeperADPCheckbox.checked;

      if (!leagueId || !idExpert) {
        return showError('Selecciona una liga y un experto');
      }

      showLoadingBar('Actualizando draft', 'Descargando datos más recientes...');

      const { players, params } = await fetchDraftData(leagueId, position, byeCondition, idExpert, sleeperADP);

      Swal.close();

      if (!players || !players.length) {
        draftData = [];
        updateCards([]);
        if (dtInstance) dtInstance.clear().draw();
        return showError('No se encontraron jugadores.');
      }

      draftData = players;

      refreshUI(draftData);

      // update ranks/adp labels
      const ranksLabel = document.getElementById('ranks-updated-label');
      if (ranksLabel && params?.ranks_published) {
        const fecha = new Date(params.ranks_published);
        ranksLabel.innerHTML = `<div class="px-3 py-1 small rounded-pill shadow-sm" style="background-color: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border);">
          <i class="bi bi-calendar-check-fill text-success"></i> Ranks actualizados: ${fecha.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</div>`;
      }

      const adpLabel = document.getElementById('adp-updated-label');
      if (adpLabel && params?.ADPdate) {
        const adpDate = new Date(params.ADPdate);
        adpLabel.innerHTML = `<div class="px-3 py-1 small rounded-pill shadow-sm" style="background-color: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border);">
          <i class="bi bi-clock-history text-warning"></i> ADP actualizado: ${adpDate.toLocaleDateString('es-MX', { dateStyle: 'medium' })}</div>`;
      }

    } catch (err) {
      Swal.close();
      console.error('Error en loadDraftData:', err);
      showError('Error al actualizar draft: ' + (err.message || err));
    }
  }

  // Initial load: if we have saved league and expert, load automatically
  const haveSaved = localStorage.getItem('draftLeague') && localStorage.getItem('draftExpert');
  if (haveSaved) {
    // restore saved view then load data
    setView(localStorage.getItem('draftView') || savedView);
    loadDraftData();
  } else {
    // default view for device
    setView(savedView);
  }

  // Ensure on resize we maintain appropriate visibility and adjust table when displayed
  window.addEventListener('resize', () => {
    if (isDesktop()) {
      // if table visible ensure columns adjusted
      if (dtInstance && (localStorage.getItem('draftView') || savedView) === 'table') {
        requestAnimationFrame(() => dtInstance.columns.adjust());
      }
    }
  });
}
