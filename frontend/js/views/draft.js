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

      /* Tabla escritorio: look original */
      #draftTable td, #draftTable th { vertical-align: middle; }
      #draftTable .badge { white-space: nowrap; }
      #draftTable .progress { height:12px; min-width:120px; }

      /* Contenedores de controles de DataTables reubicados */
      #dt-controls-top .dataTables_length label,
      #dt-controls-top .dataTables_filter label { margin-bottom: 0; }
      #dt-controls-top .dataTables_filter input { margin-left: .5rem; }
      #dt-pagination-bottom .dataTables_info { padding-top: .5rem; }
    </style>

    <div class="card border-0 shadow-sm rounded flock-card">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <h4 class="m-0 d-flex align-items-center gap-2">
            <i class="bi bi-clipboard-data text-info"></i> Draft Inteligente
          </h4>
          <div class="d-flex align-items-center gap-2">
            <!-- Toggle solo en desktop -->
            <div class="d-none d-md-block">
              <div class="btn-group btn-group-sm" role="group" aria-label="Vista">
                <button id="btn-view-cards" class="btn btn-outline-info active">
                  <i class="bi bi-grid-3x3-gap"></i> Cards
                </button>
                <button id="btn-view-table" class="btn btn-outline-info">
                  <i class="bi bi-table"></i> Tabla
                </button>
              </div>
            </div>
            <button class="btn btn-sm btn-primary" id="btn-update-draft">
              <i class="bi bi-arrow-clockwise"></i> Actualizar Draft
            </button>
          </div>
        </div>

        <form class="row g-3 mb-4">
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
          <!-- Checkbox Sleeper ADP -->
          <div class="col-md-2 d-flex align-items-end">
            <div class="form-check mt-2">
              <input class="form-check-input" type="checkbox" id="chk-sleeperADP">
              <label class="form-check-label" for="chk-sleeperADP">
                Sleeper ADP
              </label>
            </div>
          </div>
        </form>

        <div class="d-flex flex-wrap gap-3 mb-3">
          <div id="ranks-updated-label" class="text-start"></div>
          <div id="adp-updated-label" class="text-start"></div>
        </div>

        <div class="mb-3" id="draft-summary"></div>

        <!-- Controles de DT reubicados: arriba de las cards (solo desktop) -->
        <div id="dt-controls-top" class="d-none d-md-flex justify-content-between align-items-center flex-wrap gap-2 mb-2"></div>

        <!-- Cards visibles en móvil y desktop (se ocultan sólo si se elige tabla en desktop) -->
        <div id="draft-cards" class="mb-2"></div>

        <!-- Contenedor para info + paginación reubicados (abajo de las cards, solo desktop) -->
        <div id="dt-pagination-bottom" class="d-none d-md-flex justify-content-between align-items-center flex-wrap gap-2 mt-2"></div>

        <!-- Tabla (solo desktop); en vista Cards se oculta SOLO el <table>, dejando controles arriba/abajo -->
        <div class="d-none d-md-block">
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
                  <th>Steal Score</th>
                  <th>Risk Tags</th>
                  <th>Value Tags</th>
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
  const btnViewCards = document.getElementById('btn-view-cards');
  const btnViewTable = document.getElementById('btn-view-table');
  const dtControlsTop = document.getElementById('dt-controls-top');
  const dtPagBottom = document.getElementById('dt-pagination-bottom');

  // Estado de vista (desktop)
  let desktopView = 'cards'; // 'cards' | 'table'
  let draftData = [];
  let lastFiltered = []; // arreglo de jugadores que alimenta la tabla

  // =============================
  // Restaurar valores guardados
  // =============================
  const savedStatus = localStorage.getItem('draftStatusFilter');
  const savedLeague = localStorage.getItem('draftLeague');
  const savedExpert = localStorage.getItem('draftExpert');
  const savedPosition = localStorage.getItem('draftPosition');
  const savedSleeperADP = localStorage.getItem('draftSleeperADP');

  if (savedStatus) statusSelect.value = savedStatus;
  if (savedLeague) leagueSelect.value = savedLeague;
  if (savedExpert) expertSelect.value = savedExpert;
  if (savedPosition) positionSelect.value = savedPosition;
  if (savedSleeperADP) sleeperADPCheckbox.checked = savedSleeperADP === 'true';

  await renderExpertSelect('#select-expert', { plugins: ['dropdown_input'], dropdownInput: false, create: false });
  await renderLeagueSelect('#select-league', { plugins: ['dropdown_input'], dropdownInput: false, create: false });

  // =============================
  // EVENTOS DE FILTROS
  // =============================
  statusSelect.addEventListener('change', () => {
    localStorage.setItem('draftStatusFilter', statusSelect.value);
    if (draftData.length) refreshUI(draftData);
  });

  sleeperADPCheckbox.addEventListener('change', () => {
    localStorage.setItem('draftSleeperADP', sleeperADPCheckbox.checked);
    loadDraftData(); // afecta backend
  });

  positionSelect.addEventListener('change', () => { localStorage.setItem('draftPosition', positionSelect.value); loadDraftData(); });
  expertSelect.addEventListener('change', () => { localStorage.setItem('draftExpert', expertSelect.value); loadDraftData(); });
  leagueSelect.addEventListener('change', () => { localStorage.setItem('draftLeague', leagueSelect.value); loadDraftData(); });
  document.getElementById('btn-update-draft').addEventListener('click', loadDraftData);

  // Toggle de vista (solo desktop)
  btnViewCards?.addEventListener('click', () => setDesktopView('cards'));
  btnViewTable?.addEventListener('click', () => setDesktopView('table'));

  // ================================
  // UTILIDADES
  // ================================
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

  // ================================
  // TABLA (ESCRITORIO)
  // ================================
  function mountDtControls() {
    const $wrapper = $('#draftTable').closest('.dataTables_wrapper');
    if (!$wrapper.length) return;

    const $length = $wrapper.find('div.dataTables_length');
    const $filter = $wrapper.find('div.dataTables_filter');
    const $info = $wrapper.find('div.dataTables_info');
    const $paginate = $wrapper.find('div.dataTables_paginate');

    if ($length.length) $(dtControlsTop).append($length);
    if ($filter.length) $(dtControlsTop).append($filter);
    if ($info.length) $(dtPagBottom).append($info);
    if ($paginate.length) $(dtPagBottom).append($paginate);

    dtControlsTop.classList.remove('d-none');
    dtPagBottom.classList.remove('d-none');
  }

  function updateTable(filtered) {
    lastFiltered = filtered.slice();

    if (!filtered.length) {
      if ($.fn.dataTable.isDataTable('#draftTable')) {
        const t = $('#draftTable').DataTable();
        t.clear().draw();
      }
      updateCards([]);
      return;
    }

    const minPriority = Math.min(...filtered.map(p => Number(p.priorityScore) || 0));
    const maxPriority = Math.max(...filtered.map(p => Number(p.priorityScore) || 0));
    const minVOR = Math.min(...filtered.map(p => Number(p.adjustedVOR) || 0));
    const maxVOR = Math.max(...filtered.map(p => Number(p.adjustedVOR) || 0));
    const maxProj = Math.max(...filtered.map(p => Number(p.projection) || 0)) || 1;

    const dataSet = filtered.map((p, idx) => [
      `<span style="background-color:${getHeatColor(p.priorityScore, minPriority, maxPriority)};padding:0 6px;border-radius:4px;color:white;font-weight:bold;display:inline-block;">${p.priorityScore ?? ''}</span>`,
      p.adpValue ?? '', // ADP VISIBLE
      p.nombre ?? '',
      p.position ?? '',
      p.team ?? '',
      p.bye ?? '',
      p.rank ?? '',
      p.status ?? '',
      p.adpRound ?? '',
      `<div class="progress"><div class="progress-bar" role="progressbar" style="width:${Math.min(100,(Number(p.projection||0)/maxProj)*100)}%"></div></div>`,
      `<span style="background-color:${getHeatColor(p.vor, minVOR, maxVOR)};padding:0 4px;border-radius:4px;color:white;font-weight:bold;">${safeNum(p.vor)}</span>`,
      `<span style="background-color:${getHeatColor(p.adjustedVOR, minVOR, maxVOR)};padding:0 4px;border-radius:4px;color:white;font-weight:bold;">${safeNum(p.adjustedVOR)}</span>`,
      p.dropoff ?? '',
      safeNum(p.valueOverADP),
      safeNum(p.stealScore),
      (p.riskTags || []).join(', '),
      p.valueTag ?? '',
      `<span class="badge bg-danger text-light">${p.tier_global ?? ''} ${p.tier_global_label ?? ''}</span>`,
      `<span class="badge bg-primary text-light">${p.tier_pos ?? ''} ${p.tier_pos_label ?? ''}</span>`,
      String(idx) // índice oculto para mapear a cards
    ]);

    if ($.fn.dataTable.isDataTable('#draftTable')) {
      const table = $('#draftTable').DataTable();
      table.clear();
      table.rows.add(dataSet);
      table.draw(false);
    } else {
      const table = $('#draftTable').DataTable({
        data: dataSet,
        scrollX: true,
        autoWidth: false,
        destroy: true,
        pageLength: 25,
        // Orden inicial por rank (columna 6)
        order: [[6, 'asc']],
        // Creamos length, filter, info y paginación para luego moverlos a nuestros contenedores
        dom: 'lfrtip',
        language: { url: '//cdn.datatables.net/plug-ins/2.3.2/i18n/es-MX.json' },
        columnDefs: [
          // columnas no ordenables
          { targets: [9, 16, 17, 18], orderable: false },
          // estilos
          { targets: [9, 16, 17, 18], className: 'text-nowrap text-center' },
          // ocultar SOLO la columna índice final
          { targets: [19], visible: false, searchable: false }
        ],
        rowCallback: function (row, data) {
          const tier = $(data[17]).text().toLowerCase();
          $(row).removeClass('tier-elite tier-starter tier-bench tier-steal');
          if (tier.includes('elite')) $(row).addClass('tier-elite');
          else if (tier.includes('starter')) $(row).addClass('tier-starter');
          else if (tier.includes('bench')) $(row).addClass('tier-bench');
          if ($(data[16]).text().includes('💎 Steal')) $(row).addClass('tier-steal');
        },
        initComplete: function () {
          // Mover controles a los contenedores personalizados
          mountDtControls();

          // Si estamos en vista cards al iniciar, ocultamos el <table> y pintamos cards de la página actual
          if (isDesktop() && desktopView === 'cards') {
            document.getElementById('draftTable').classList.add('d-none');
            renderCardsFromDataTable();
          }
        }
      });

      // Cuando DataTables cambie búsqueda/orden/página, refrescamos las cards si la vista activa es "cards"
      $('#draftTable').on('draw.dt', () => {
        if (isDesktop() && desktopView === 'cards') {
          renderCardsFromDataTable();
        }
      });
    }

    // Si estamos en desktop + cards, renderizar cards con el estado de DT
    if (isDesktop() && desktopView === 'cards') {
      renderCardsFromDataTable();
    }
  }

  // ================================
  // CARDS (Móvil + Desktop)
  // ================================
  function updateCards(players) {
    const cont = cardsContainer;
    if (!players.length) {
      cont.innerHTML = `<div class="text-center text-muted">Sin jugadores.</div>`;
      return;
    }

    const maxProj = Math.max(...players.map(p => Number(p.projection) || 0)) || 1;

    cont.innerHTML = `
      <div class="row g-2">
        ${players.map(p => {
          const risk = (p.riskTags || []).join(', ');
          const prio = (p.priorityScore ?? '') + '';
          const projPct = Math.min(100, (Number(p.projection||0)/maxProj)*100);
          return `
            <div class="col-12 col-md-4 col-lg-3">
              <div class="draft-card">
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
                  <span class="kv"><strong>Steal:</strong> ${safeNum(p.stealScore)}</span>
                </div>
                <div class="mt-2 d-flex flex-wrap gap-2">
                  ${p.valueTag ? `<span class="badge bg-success">${p.valueTag}</span>` : ''}
                  ${risk ? `<span class="badge bg-warning text-dark">${risk}</span>` : ''}
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

  // Renderizar cards desde el estado actual de DataTables (página/búsqueda/orden aplicados)
  function renderCardsFromDataTable() {
    if (!$.fn.dataTable.isDataTable('#draftTable')) return;
    const t = $('#draftTable').DataTable();
    const rows = t.rows({ page: 'current', search: 'applied', order: 'applied' }).data().toArray();
    const idxCol = 19; // última columna es el índice oculto
    const pagePlayers = rows
      .map(r => lastFiltered[Number(r[idxCol])])
      .filter(Boolean);

    updateCards(pagePlayers);
    renderSummary(pagePlayers);
  }

  // ================================
  // REFRESH (aplica filtro y pinta según vista)
  // ================================
  function refreshUI(data) {
    const statusFilter = statusSelect.value;
    const filtered = data.filter(p => statusFilter === 'TODOS' || (p.status || '').toLowerCase().trim() === 'libre');

    if (isDesktop()) {
      updateTable(filtered); // DT controla búsqueda/orden/página
      if (desktopView === 'table') {
        renderSummary(filtered);
      }
    } else {
      renderSummary(filtered);
      updateCards(filtered);
    }
  }

  // ================================
  // CARGA DE DATOS
  // ================================
  async function loadDraftData() {
    try {
      const leagueId = leagueSelect.value;
      const position = positionSelect.value;
      const byeCondition = byeInput.value || 0;
      const selectedOption = expertSelect.selectedOptions[0];
      const idExpert = selectedOption?.dataset.id || '';
      const sleeperADP = sleeperADPCheckbox.checked;

      if (!leagueId || !idExpert) {
        return showError('Selecciona una liga y un experto');
      }

      showLoadingBar('Actualizando draft', 'Descargando datos más recientes...');

      // PASAMOS sleeperADP al fetchDraftData (bool)
      const { players, params } = await fetchDraftData(leagueId, position, byeCondition, idExpert, sleeperADP);

      Swal.close();

      if (!players.length) {
        updateCards([]);
        if ($.fn.dataTable.isDataTable('#draftTable')) {
          $('#draftTable').DataTable().clear().draw();
        }
        return showError('No se encontraron jugadores.');
      }

      draftData = players;
      refreshUI(draftData);

      // Fechas
      const ranksLabel = document.getElementById('ranks-updated-label');
      if (ranksLabel && params?.ranks_published) {
        const fecha = new Date(params.ranks_published);
        ranksLabel.innerHTML = `
          <div class="px-3 py-1 small rounded-pill shadow-sm"
               style="background-color: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border);">
            <i class="bi bi-calendar-check-fill text-success"></i>
            Ranks actualizados: ${fecha.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
          </div>`;
      }

      const adpLabel = document.getElementById('adp-updated-label');
      if (adpLabel && params?.ADPdate) {
        const adpDate = new Date(params.ADPdate);
        adpLabel.innerHTML = `
          <div class="px-3 py-1 small rounded-pill shadow-sm"
               style="background-color: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border);">
            <i class="bi bi-clock-history text-warning"></i>
            ADP actualizado: ${adpDate.toLocaleDateString('es-MX', { dateStyle: 'medium' })}
          </div>`;
      }

    } catch (err) {
      Swal.close();
      console.error('Error en loadDraftData:', err);
      showError('Error al actualizar draft: ' + err.message);
    }
  }

  // ================================
  // Helpers de vista
  // ================================
  function isDesktop() {
    return window.matchMedia('(min-width: 768px)').matches;
  }

  function setDesktopView(view) {
    if (!isDesktop()) return; // en móvil siempre cards
    desktopView = view;

    // Toggle botones
    if (btnViewCards && btnViewTable) {
      btnViewCards.classList.toggle('active', view === 'cards');
      btnViewTable.classList.toggle('active', view === 'table');
    }

    const tableEl = document.getElementById('draftTable');

    if (view === 'cards') {
      // mostrar cards, ocultar solo el <table>
      cardsContainer.classList.remove('d-none');
      if (tableEl) tableEl.classList.add('d-none');

      // re-pintar cards desde el estado actual de DT
      if ($.fn.dataTable.isDataTable('#draftTable')) {
        renderCardsFromDataTable();
      }
    } else {
      // mostrar tabla, ocultar cards
      cardsContainer.classList.add('d-none');
      if (tableEl) {
        tableEl.classList.remove('d-none');
        // ⚙️ Asegurar encabezados y tamaños correctos al volver a mostrar la tabla
        if ($.fn.dataTable.isDataTable('#draftTable')) {
          const t = $('#draftTable').DataTable();
          // En algunos casos ayuda forzar el display del thead y luego ajustar columnas
          $(t.table().header()).css('display', '');
          setTimeout(() => {
            t.columns.adjust().draw(false);
          }, 0);
        }
      }
      // summary con todo el set filtrado actual
      if (lastFiltered.length) renderSummary(lastFiltered);
    }
  }

  // ================================
  // Bootstrap inicial
  // ================================
  if (savedLeague && savedPosition && savedExpert) loadDraftData();

  // Al cargar, forzamos vista cards en desktop por defecto
  setTimeout(() => setDesktopView('cards'), 0);

  // Reaccionar a cambios de tamaño (si cambia entre móvil/desktop)
  window.addEventListener('resize', () => {
    if (!isDesktop()) {
      // móvil: controles de DT ocultos por CSS; mostrar cards siempre
      cardsContainer.classList.remove('d-none');
    } else {
      // desktop: aplicar el modo actual
      setDesktopView(desktopView);
    }
  });
}
