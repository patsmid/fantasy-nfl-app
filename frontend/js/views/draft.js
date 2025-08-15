import { fetchDraftData } from '../api.js';
import { positions } from '../../components/constants.js';
import { showError, showLoadingBar } from '../../components/alerts.js';
import { renderExpertSelect } from '../../components/selectExperts.js';
import { renderLeagueSelect } from '../../components/selectLeagues.js';

export default async function renderDraftView() {
  const content = document.getElementById('content-container');
  content.innerHTML = `
    <style>
      /* Añade esto a tu CSS global si prefieres no inyectarlo aquí */
      #draftTable td,
      #draftTable th {
        white-space: normal; /* permitir saltos de línea */
        word-break: break-word; /* cortar texto largo */
        vertical-align: middle;
      }
      /* Columnas que conviene mantener sin quiebre (ej: Priority, ADP, Ronda) */
      #draftTable td.priority-col,
      #draftTable th.priority-col,
      #draftTable td.adp-col,
      #draftTable th.adp-col,
      #draftTable td.round-col,
      #draftTable th.round-col {
        white-space: nowrap;
      }
      /* Progreso: que quepa en su celda */
      #draftTable .progress {
        min-width: 80px;
        max-width: 200px;
      }

      /* Badges dentro de celdas pequeñas */
      #draftTable .badge {
        white-space: nowrap;
      }
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

        <div class="table-responsive">
          <table id="draftTable" class="table table-dark table-hover align-middle w-100">
            <thead class="table-dark">
              <tr>
                <th class="priority-col">Priority</th>
                <th class="adp-col">ADP</th>
                <th>Jugador</th>
                <th>Posición</th>
                <th>Equipo</th>
                <th>Bye</th>
                <th>Ranking</th>
                <th>Status</th>
                <th class="round-col">Ronda</th>
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
        table.clear();
        table.draw();
      }
      return;
    }

    // Valores guardando seguridad contra undefined
    const priorityVals = filtered.map(p => Number(p.priorityScore) || 0);
    const minPriority = Math.min(...priorityVals);
    const maxPriority = Math.max(...priorityVals);

    const vorVals = filtered.map(p => Number(p.adjustedVOR) || 0);
    const minVOR = Math.min(...vorVals);
    const maxVOR = Math.max(...vorVals);

    const projVals = filtered.map(p => Number(p.projection) || 0);
    const maxProj = Math.max(...projVals) || 1; // evitar division por 0

    const dataSet = filtered.map(p => [
      // 0 Priority (añadimos clase para control CSS)
      `<span class="priority-col" style="background-color:${getHeatColor(p.priorityScore, minPriority, maxPriority)};padding:0 6px;border-radius:4px;color:white;font-weight:bold;display:inline-block;">${p.priorityScore ?? ''}</span>`,
      // 1 ADP
      p.adpValue ?? '',
      // 2 Nombre
      p.nombre ?? '',
      // 3 Pos
      p.position ?? '',
      // 4 Team
      p.team ?? '',
      // 5 Bye
      p.bye ?? '',
      // 6 Rank
      p.rank ?? '',
      // 7 Status
      p.status ?? '',
      // 8 ADP Round
      p.adpRound ?? '',
      // 9 Projection (progress)
      `<div class="progress" style="height:12px;">
        <div class="progress-bar bg-info" role="progressbar" style="width:${Math.min(100,(Number(p.projection || 0)/maxProj)*100)}%"></div>
      </div>`,
      // 10 VOR
      `<span style="background-color:${getHeatColor(p.vor, minVOR, maxVOR)};padding:0 4px;border-radius:4px;color:white;font-weight:bold;">${safeNum(p.vor)}</span>`,
      // 11 Adjusted VOR
      `<span style="background-color:${getHeatColor(p.adjustedVOR, minVOR, maxVOR)};padding:0 4px;border-radius:4px;color:white;font-weight:bold;">${safeNum(p.adjustedVOR)}</span>`,
      // 12 Dropoff
      p.dropoff ?? '',
      // 13 Value/ADP
      safeNum(p.valueOverADP),
      // 14 Steal Score
      safeNum(p.stealScore),
      // 15 Risk Tags
      (p.riskTags || []).join(', '),
      // 16 Value Tags
      p.valueTag ?? '',
      // 17 Tier Global
      `<span class="badge bg-danger text-light">${p.tier_global ?? ''} ${p.tier_global_label ?? ''}</span>`,
      // 18 Tier Pos
      `<span class="badge bg-primary text-light">${p.tier_pos ?? ''} ${p.tier_pos_label ?? ''}</span>`
    ]);

    renderSummary(filtered);

    if ($.fn.dataTable.isDataTable('#draftTable')) {
      const table = $('#draftTable').DataTable();
      table.clear();
      table.rows.add(dataSet);
      table.draw();
    } else {
      $('#draftTable').DataTable({
        data: dataSet,
        responsive: {
          details: {
            type: 'inline' // muestra columnas ocultas dentro de la misma fila (no hace falta control column)
          }
        },
        autoWidth: false,
        destroy: true,
        pageLength: 25,
        order: [[0, 'desc']],
        language: { url: '//cdn.datatables.net/plug-ins/2.3.2/i18n/es-MX.json' },
        dom: '<"row mb-2"<"col-sm-6"l><"col-sm-6"f>>tip',
        columnDefs: [
          // anchuras y prioridades de colapso (1 = más importante, números grandes = menos prioridad)
          { targets: 0, responsivePriority: 1, width: '90px', className: 'priority-col text-center' }, // Priority
          { targets: 2, responsivePriority: 2 }, // Jugador
          { targets: 3, responsivePriority: 3 }, // Posición
          { targets: 4, responsivePriority: 4 }, // Equipo
          { targets: 9, responsivePriority: 5, orderable: false, className: 'text-center' }, // Proyección
          { targets: [10, 11], responsivePriority: 6, className: 'text-center' }, // VORs
          { targets: [13, 14], responsivePriority: 7, className: 'text-center' }, // Value/ADP, Steal
          { targets: [1, 5, 6, 7, 8], responsivePriority: 8 }, // ADP, Bye, Rank, Status, Round
          { targets: [15, 16, 17, 18, 12], responsivePriority: 100, orderable: false, className: 'text-center' } // menos importantes: Risk/Value tags, Tiers, Dropoff
        ],
        rowCallback: function (row, data) {
          // data[] contiene el HTML de las celdas - extraemos texto con jQuery
          const tierText = $('<div>').html(data[17] || '').text().toLowerCase();
          $(row).removeClass('tier-elite tier-starter tier-bench tier-steal');

          if (tierText.includes('elite')) $(row).addClass('tier-elite');
          else if (tierText.includes('starter')) $(row).addClass('tier-starter');
          else if (tierText.includes('bench')) $(row).addClass('tier-bench');

          const valueTagText = (data[16]) ? $('<div>').html(data[16]).text() : '';
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
