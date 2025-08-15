import { fetchDraftData } from '../api.js';
import { positions } from '../../components/constants.js';
import { showError, showLoadingBar } from '../../components/alerts.js';
import { renderExpertSelect } from '../../components/selectExperts.js';
import { renderLeagueSelect } from '../../components/selectLeagues.js';

export default async function renderDraftView() {
  const content = document.getElementById('content-container');
  content.innerHTML = `
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
          <div class="col-md-2">
            <label for="input-bye" class="form-label">Bye condición</label>
            <input type="number" class="form-control" id="input-bye" placeholder="0">
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
    if (max === min) return '#888';
    const ratio = (value - min) / (max - min);
    const r = Math.floor(255 * (1 - ratio));
    const g = Math.floor(255 * ratio);
    return `rgb(${r},${g},0)`;
  };

  function renderSummary(players) {
    const summary = { tiers: {}, steals: 0, risks: 0 };
    players.forEach(p => {
      summary.tiers[p.tier_global_label] = (summary.tiers[p.tier_global_label] || 0) + 1;
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

    if (!filtered.length) return;

    const minPriority = Math.min(...filtered.map(p => p.priorityScore));
    const maxPriority = Math.max(...filtered.map(p => p.priorityScore));

    const minVOR = Math.min(...filtered.map(p => p.adjustedVOR));
    const maxVOR = Math.max(...filtered.map(p => p.adjustedVOR));

    const maxProj = Math.max(...filtered.map(p => p.projection));

    const dataSet = filtered.map(p => [
      `<span style="background-color:${getHeatColor(p.priorityScore, minPriority, maxPriority)};padding:0 6px;border-radius:4px;color:white;font-weight:bold;">${p.priorityScore}</span>`,
      p.adpValue ?? '',
      p.nombre,
      p.position,
      p.team,
      p.bye ?? '',
      p.rank ?? '',
      p.status,
      p.adpRound ?? '',
      `<div class="progress" style="height:12px;">
        <div class="progress-bar bg-info" role="progressbar" style="width:${Math.min(100,(p.projection/maxProj)*100)}%"></div>
      </div>`,
      `<span style="background-color:${getHeatColor(p.vor, minVOR, maxVOR)};padding:0 4px;border-radius:4px;color:white;font-weight:bold;">${p.vor}</span>`,
      `<span style="background-color:${getHeatColor(p.adjustedVOR, minVOR, maxVOR)};padding:0 4px;border-radius:4px;color:white;font-weight:bold;">${p.adjustedVOR}</span>`,
      p.dropoff ?? '',
      Number(p.valueOverADP.toFixed(2)),
      Number(p.stealScore.toFixed(2)),
      p.riskTags.join(', '),
      p.valueTag ?? '',
      `<span class="badge bg-danger text-light">${p.tier_global ?? ''} ${p.tier_global_label ?? ''}</span>`,
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
        responsive: true,
        scrollX: true,
        autoWidth: false,
        destroy: true,
        pageLength: 25,
        order: [[0, 'desc']],
        language: { url: '//cdn.datatables.net/plug-ins/2.3.2/i18n/es-MX.json' },
        dom: '<"row mb-2"<"col-sm-6"l><"col-sm-6"f>>tip',
        columnDefs: [{ targets: [9, 16, 17, 18], orderable: false }, { targets: [9, 16, 17, 18], className: 'text-nowrap text-center' }],
        rowCallback: function (row, data) {
          const tier = $(data[17]).text().toLowerCase();
          $(row).removeClass('tier-elite tier-starter tier-bench tier-steal');

          if (tier.includes('elite')) $(row).addClass('tier-elite');
          else if (tier.includes('starter')) $(row).addClass('tier-starter');
          else if (tier.includes('bench')) $(row).addClass('tier-bench');

          if ($(data[16]).text().includes('💎 Steal')) $(row).addClass('tier-steal');
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
      if (!leagueId || !idExpert) return showError('Selecciona una liga y un experto');

      showLoadingBar('Actualizando draft', 'Descargando datos más recientes...');
      const res = await fetchDraftData(leagueId, position, byeCondition, idExpert);

      // CORRECCIÓN: acceder correctamente a players
      draftData = res.data?.data?.players || [];
      updateTable(draftData);

      // Fechas
      const ranksLabel = document.getElementById('ranks-updated-label');
      if (ranksLabel && res?.data?.params?.ranks_published) {
        const fecha = new Date(res.data.params.ranks_published);
        ranksLabel.innerHTML = `<div class="px-3 py-1 small rounded-pill shadow-sm" style="background-color: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border);">
          <i class="bi bi-calendar-check-fill text-success"></i> Ranks actualizados: ${fecha.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
        </div>`;
      }

      const adpLabel = document.getElementById('adp-updated-label');
      if (adpLabel && res?.data?.params?.ADPdate) {
        const adpDate = new Date(res.data.params.ADPdate);
        adpLabel.innerHTML = `<div class="px-3 py-1 small rounded-pill shadow-sm" style="background-color: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border);">
          <i class="bi bi-clock-history text-warning"></i> ADP actualizado: ${adpDate.toLocaleDateString('es-MX', { dateStyle: 'medium' })}
        </div>`;
      }

      Swal.close();
    } catch (err) {
      Swal.close();
      showError('Error al actualizar draft: ' + err.message);
    }
  }

  if (savedLeague && savedPosition && savedExpert) loadDraftData();
}
