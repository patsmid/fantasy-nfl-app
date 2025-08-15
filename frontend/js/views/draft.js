import { fetchDraftData } from '../api.js';
import { positions } from '../../components/constants.js';
import { showError, showLoadingBar } from '../../components/alerts.js';
import { renderExpertSelect } from '../../components/selectExperts.js';
import { renderLeagueSelect } from '../../components/selectLeagues.js';

export default async function renderDraftView() {
  const content = document.getElementById('content-container');
  content.innerHTML = `
    <style>
      /* Layout estable y sin scroll horizontal */
      #draftTable { table-layout: fixed; width: 100%; }

      /* No saltos de línea en celdas visibles */
      #draftTable td, #draftTable th {
        white-space: nowrap;
        vertical-align: middle;
      }

      /* Elipsis sólo donde puede haber texto largo */
      .cell-ellipsis {
        display: inline-block;
        overflow: hidden;
        text-overflow: ellipsis;
        vertical-align: bottom;
      }
      /* Anchos sugeridos para contenido largo */
      .col-player .cell-ellipsis { max-width: 220px; }
      .col-tags .cell-ellipsis { max-width: 200px; }

      /* Anchos orientativos para columnas compactas */
      th.priority-col, td.priority-col { width: 90px; text-align: center; }
      th.adp-col, td.adp-col { width: 70px; text-align: center; }
      th.round-col, td.round-col { width: 70px; text-align: center; }
      th.pos-col, td.pos-col { width: 80px; text-align: center; }
      th.team-col, td.team-col { width: 80px; text-align: center; }
      th.bye-col, td.bye-col { width: 60px; text-align: center; }
      th.rank-col, td.rank-col { width: 80px; text-align: center; }
      th.status-col, td.status-col { width: 90px; text-align: center; }
      th.proj-col, td.proj-col { width: 130px; }
      th.vor-col, td.vor-col,
      th.avor-col, td.avor-col { width: 100px; text-align:center; }

      /* Barra de progreso con tamaño fijo para evitar saltos */
      #draftTable .progress { height: 12px; width: 120px; margin: 0 auto; }

      /* Badges compactas */
      #draftTable .badge { white-space: nowrap; }

      /* Columna de control (Responsive) */
      th.control, td.control { width: 28px; text-align: center; }
    </style>

    <div class="card border-0 shadow-sm rounded flock-card">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <h4 class="m-0 d-flex align-items-center gap-2">
            <i class="bi bi-clipboard-data text-info"></i> Draft Inteligente
          </h4>
          <button class="btn btn-sm btn-primary" id="btn-update-draft">
            <i class="bi bi-arrow-clockwise"></i> Actualizar Draft
          </button>
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
        </form>

        <div class="d-flex flex-wrap gap-3 mb-3">
          <div id="ranks-updated-label" class="text-start"></div>
          <div id="adp-updated-label" class="text-start"></div>
        </div>

        <div class="mb-3" id="draft-summary"></div>

        <!-- OJO: dejamos el wrapper responsive de Bootstrap, no debería activar scroll si DataTables oculta columnas -->
        <div class="table-responsive">
          <table id="draftTable" class="table table-dark table-hover align-middle w-100">
            <thead class="table-dark">
              <tr>
                <th class="control"></th> <!-- Columna de control para Responsive -->
                <th class="priority-col">Priority</th>
                <th class="adp-col">ADP</th>
                <th class="col-player">Jugador</th>
                <th class="pos-col">Posición</th>
                <th class="team-col">Equipo</th>
                <th class="bye-col">Bye</th>
                <th class="rank-col">Ranking</th>
                <th class="status-col">Status</th>
                <th class="round-col">Ronda</th>
                <th class="proj-col">Proyección</th>
                <th class="vor-col">VOR</th>
                <th class="avor-col">VOR Ajustado</th>
                <th>Dropoff</th>
                <th>Value/ADP</th>
                <th>Steal Score</th>
                <th class="col-tags">Risk Tags</th>
                <th class="col-tags">Value Tags</th>
                <th>Tier Global</th>
                <th>Tier Posición</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  const statusSelect = document.getElementById('select-status');
  const leagueSelect = document.getElementById('select-league');
  const positionSelect = document.getElementById('select-position');
  const expertSelect = document.getElementById('select-expert');
  const byeInput = document.getElementById('input-bye');

  const savedStatus = localStorage.getItem('draftStatusFilter');
  const savedLeague = localStorage.getItem('draftLeague');
  const savedExpert = localStorage.getItem('draftExpert');
  const savedPosition = localStorage.getItem('draftPosition');

  if (savedStatus) statusSelect.value = savedStatus;
  if (savedLeague) leagueSelect.value = savedLeague;
  if (savedExpert) expertSelect.value = savedExpert;
  if (savedPosition) positionSelect.value = savedPosition;

  await renderExpertSelect('#select-expert', { plugins: ['dropdown_input'], dropdownInput: false, create: false });
  await renderLeagueSelect('#select-league', { plugins: ['dropdown_input'], dropdownInput: false, create: false });

  statusSelect.addEventListener('change', () => { localStorage.setItem('draftStatusFilter', statusSelect.value); if (draftData.length) updateTable(draftData); });
  positionSelect.addEventListener('change', () => { localStorage.setItem('draftPosition', positionSelect.value); loadDraftData(); });
  expertSelect.addEventListener('change', () => { localStorage.setItem('draftExpert', expertSelect.value); loadDraftData(); });
  leagueSelect.addEventListener('change', () => { localStorage.setItem('draftLeague', leagueSelect.value); loadDraftData(); });
  document.getElementById('btn-update-draft').addEventListener('click', loadDraftData);

  let draftData = [];

  // ================================
  // FUNCIONES AUXILIARES
  // ================================
  const getHeatColor = (value, min, max) => {
    if (value == null || isNaN(value) || max === min) return '#888';
    const ratio = (value - min) / (max - min);
    const r = Math.floor(255 * (1 - ratio));
    const g = Math.floor(255 * ratio);
    return `rgb(${r},${g},0)`;
  };

  const safeNum = (v, decimals = 2) => {
    return (typeof v === 'number' && Number.isFinite(v)) ? Number(v.toFixed(decimals)) : '';
  };

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

  async function updateTable(data) {
    const statusFilter = statusSelect.value;
    const filtered = data.filter(p => statusFilter === 'TODOS' || (p.status || '').toLowerCase().trim() === 'libre');

    if (!filtered.length) {
      if ($.fn.dataTable.isDataTable('#draftTable')) {
        const table = $('#draftTable').DataTable();
        table.clear(); table.draw();
      }
      return;
    }

    const priorityVals = filtered.map(p => Number(p.priorityScore) || 0);
    const minPriority = Math.min(...priorityVals);
    const maxPriority = Math.max(...priorityVals);

    const vorVals = filtered.map(p => Number(p.adjustedVOR) || 0);
    const minVOR = Math.min(...vorVals);
    const maxVOR = Math.max(...vorVals);

    const projVals = filtered.map(p => Number(p.projection) || 0);
    const maxProj = Math.max(...projVals) || 1;

    const dataSet = filtered.map(p => {
      const playerName = p.nombre ?? '';
      const riskTxt = (p.riskTags || []).join(', ');
      const valueTxt = p.valueTag ?? '';

      return [
        // 0: control column (vacío, DataTables pone el icono)
        '',
        // 1: Priority
        `<span class="priority-col" style="background-color:${getHeatColor(p.priorityScore, minPriority, maxPriority)};padding:0 6px;border-radius:4px;color:white;font-weight:bold;display:inline-block;">${p.priorityScore ?? ''}</span>`,
        // 2: ADP
        p.adpValue ?? '',
        // 3: Jugador (elipsis + title)
        `<span class="cell-ellipsis" title="${playerName}">${playerName}</span>`,
        // 4: Pos
        p.position ?? '',
        // 5: Team
        p.team ?? '',
        // 6: Bye
        p.bye ?? '',
        // 7: Rank
        p.rank ?? '',
        // 8: Status
        p.status ?? '',
        // 9: Ronda
        p.adpRound ?? '',
        // 10: Proyección (barra fija)
        `<div class="progress">
           <div class="progress-bar bg-info" role="progressbar" style="width:${Math.min(100,(Number(p.projection || 0)/maxProj)*100)}%"></div>
         </div>`,
        // 11: VOR
        `<span style="background-color:${getHeatColor(p.vor, minVOR, maxVOR)};padding:0 4px;border-radius:4px;color:white;font-weight:bold;">${safeNum(p.vor)}</span>`,
        // 12: VOR Ajustado
        `<span style="background-color:${getHeatColor(p.adjustedVOR, minVOR, maxVOR)};padding:0 4px;border-radius:4px;color:white;font-weight:bold;">${safeNum(p.adjustedVOR)}</span>`,
        // 13: Dropoff
        p.dropoff ?? '',
        // 14: Value/ADP
        safeNum(p.valueOverADP),
        // 15: Steal Score
        safeNum(p.stealScore),
        // 16: Risk Tags (elipsis + title)
        `<span class="cell-ellipsis" title="${riskTxt}">${riskTxt}</span>`,
        // 17: Value Tags (elipsis + title)
        `<span class="cell-ellipsis" title="${valueTxt}">${valueTxt}</span>`,
        // 18: Tier Global
        `<span class="badge bg-danger text-light" title="${(p.tier_global ?? '') + ' ' + (p.tier_global_label ?? '')}">${p.tier_global ?? ''} ${p.tier_global_label ?? ''}</span>`,
        // 19: Tier Pos
        `<span class="badge bg-primary text-light" title="${(p.tier_pos ?? '') + ' ' + (p.tier_pos_label ?? '')}">${p.tier_pos ?? ''} ${p.tier_pos_label ?? ''}</span>`
      ];
    });

    renderSummary(filtered);

    if ($.fn.dataTable.isDataTable('#draftTable')) {
      const table = $('#draftTable').DataTable();
      table.clear();
      table.rows.add(dataSet);
      table.draw(false);
    } else {
      $('#draftTable').DataTable({
        data: dataSet,
        responsive: {
          details: {
            type: 'column',
            target: 0 // la primera columna muestra el botón +/-
          }
        },
        autoWidth: false,
        destroy: true,
        pageLength: 25,
        order: [[1, 'desc']], // ordenar por Priority (columna 1)
        language: { url: '//cdn.datatables.net/plug-ins/2.3.2/i18n/es-MX.json' },
        dom: '<"row mb-2"<"col-sm-6"l><"col-sm-6"f>>tip',
        columnDefs: [
          // Columna de control
          { targets: 0, className: 'control', orderable: false, responsivePriority: 1 },

          // Columnas clave que deben verse primero
          { targets: 1, className: 'priority-col', responsivePriority: 2 },         // Priority
          { targets: 3, className: 'col-player', responsivePriority: 3 },           // Jugador
          { targets: 4, className: 'pos-col text-center', responsivePriority: 4 },  // Pos
          { targets: 5, className: 'team-col text-center', responsivePriority: 5 }, // Equipo
          { targets: 10, className: 'proj-col text-center', orderable: false, responsivePriority: 6 }, // Proyección

          // Importantes pero prescindibles en pantallas chicas
          { targets: [11,12], className: 'text-center', responsivePriority: 7 }, // VORs
          { targets: [14,15], className: 'text-center', responsivePriority: 8 }, // Value/ADP, Steal

          // Secundarias: se ocultan antes
          { targets: [2,6,7,8,9], className: 'text-center', responsivePriority: 50 }, // ADP, Bye, Rank, Status, Ronda
          { targets: [13,16,17,18,19], orderable: false, responsivePriority: 100 }   // Dropoff, Tags, Tiers
        ],
        rowCallback: function (row, data) {
          const tierText = $('<div>').html(data[18] || '').text().toLowerCase();
          $(row).removeClass('tier-elite tier-starter tier-bench tier-steal');

          if (tierText.includes('elite')) $(row).addClass('tier-elite');
          else if (tierText.includes('starter')) $(row).addClass('tier-starter');
          else if (tierText.includes('bench')) $(row).addClass('tier-bench');

          const valueTagText = (data[17]) ? $('<div>').html(data[17]).text() : '';
          if (valueTagText.includes('💎 Steal')) $(row).addClass('tier-steal');
        }
      });
    }
  }

  async function loadDraftData() {
    try {
      const leagueId = leagueSelect.value;
      const position = positionSelect.value;
      const byeCondition = byeInput.value || 0;
      const selectedOption = expertSelect.selectedOptions[0];
      const idExpert = selectedOption?.dataset.id || '';

      if (!leagueId || !idExpert) {
        return showError('Selecciona una liga y un experto');
      }

      showLoadingBar('Actualizando draft', 'Descargando datos más recientes...');

      const { players, params } = await fetchDraftData(
        leagueId,
        position,
        byeCondition,
        idExpert
      );

      if (!players.length) {
        Swal.close();
        return showError('No se encontraron jugadores.');
      }

      draftData = players;
      updateTable(draftData);

      // Fechas de actualización
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

      Swal.close();
    } catch (err) {
      Swal.close();
      console.error('Error en loadDraftData:', err);
      showError('Error al actualizar draft: ' + err.message);
    }
  }

  if (savedLeague && savedPosition && savedExpert) loadDraftData();
}
