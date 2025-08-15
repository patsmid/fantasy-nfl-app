import { fetchDraftData } from '../api.js';
import { positions } from '../../components/constants.js';
import { showError, showLoadingBar } from '../../components/alerts.js';
import { renderExpertSelect } from '../../components/selectExperts.js';
import { renderLeagueSelect } from '../../components/selectLeagues.js';

export default async function renderDraftView() {
  const content = document.getElementById('content-container');
  content.innerHTML = `
    <style>
      /* Cards para móvil */
      #draft-cards .draft-card {
        background: var(--bg-secondary, #1e1e1e);
        color: var(--text-primary, #f8f9fa);
        border: 1px solid var(--border, rgba(255,255,255,.08));
        border-radius: .75rem;
        padding: .75rem .9rem;
      }
      #draft-cards .title-row {
        display:flex; align-items:center; justify-content:space-between; gap:.5rem; margin-bottom:.35rem;
      }
      #draft-cards .player {
        font-weight:600; font-size:1rem; line-height:1.2;
      }
      #draft-cards .meta {
        display:flex; flex-wrap:wrap; gap:.5rem .75rem; font-size:.85rem; opacity:.9;
      }
      #draft-cards .kv { display:flex; gap:.25rem; align-items:center; }
      #draft-cards .progress { height:10px; background: rgba(255,255,255,.08); }
      #draft-cards .progress-bar { background-color:#0dcaf0; }

      /* Para la tabla de escritorio mantenemos el look original */
      #draftTable td, #draftTable th { vertical-align: middle; }
      #draftTable .badge { white-space: nowrap; }
      #draftTable .progress { height:12px; min-width:120px; }
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

          <!-- NUEVO: Checkbox Sleeper ADP -->
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

        <div class="mb-3" id="draft-summary"></div>

        <!-- Vista móvil: cards -->
        <div id="draft-cards" class="d-md-none"></div>

        <!-- Vista escritorio: tabla (no responsive de DataTables) -->
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

  // Restaurar valores guardados
  const savedStatus = localStorage.getItem('draftStatusFilter');
  const savedLeague = localStorage.getItem('draftLeague');
  const savedExpert = localStorage.getItem('draftExpert');
  const savedPosition = localStorage.getItem('draftPosition');
  const savedSleeperADP = localStorage.getItem('draftSleeperADP');

  if (savedStatus) statusSelect.value = savedStatus;
  if (savedLeague) leagueSelect.value = savedLeague;
  if (savedExpert) expertSelect.value = savedExpert;
  if (savedPosition) positionSelect.value = savedPosition;
  sleeperADPCheckbox.checked = savedSleeperADP === 'true';

  // Render select con tom-select y sin abrir al seleccionar
  await renderExpertSelect('#select-expert', { plugins: ['dropdown_input'], dropdownInput: false, create: false });
  await renderLeagueSelect('#select-league', { plugins: ['dropdown_input'], dropdownInput: false, create: false });

  // =============================
  // EVENTOS DE FILTROS
  // =============================
  sleeperADPCheckbox.addEventListener('change', () => {
    localStorage.setItem('draftSleeperADP', sleeperADPCheckbox.checked);
    loadDraftData();
  });

  positionSelect.addEventListener('change', () => { localStorage.setItem('draftPosition', positionSelect.value); loadDraftData(); });
  expertSelect.addEventListener('change', () => { localStorage.setItem('draftExpert', expertSelect.value); loadDraftData(); });
  leagueSelect.addEventListener('change', () => { localStorage.setItem('draftLeague', leagueSelect.value); loadDraftData(); });
  document.getElementById('btn-update-draft').addEventListener('click', loadDraftData);

  let draftData = [];

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
  function updateTable(filtered) {
    if (!filtered.length) {
      if ($.fn.dataTable.isDataTable('#draftTable')) {
        const t = $('#draftTable').DataTable();
        t.clear().draw();
      }
      return;
    }

    const minPriority = Math.min(...filtered.map(p => Number(p.priorityScore) || 0));
    const maxPriority = Math.max(...filtered.map(p => Number(p.priorityScore) || 0));
    const minVOR = Math.min(...filtered.map(p => Number(p.adjustedVOR) || 0));
    const maxVOR = Math.max(...filtered.map(p => Number(p.adjustedVOR) || 0));
    const maxProj = Math.max(...filtered.map(p => Number(p.projection) || 0)) || 1;

    const dataSet = filtered.map(p => [
      `<span style="background-color:${getHeatColor(p.priorityScore, minPriority, maxPriority)};padding:0 6px;border-radius:4px;color:white;font-weight:bold;display:inline-block;">${p.priorityScore ?? ''}</span>`,
      p.adpValue ?? '',
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
      `<span class="badge bg-primary text-light">${p.tier_pos ?? ''} ${p.tier_pos_label ?? ''}</span>`
    ]);

    if ($.fn.dataTable.isDataTable('#draftTable')) {
      const table = $('#draftTable').DataTable();
      table.clear();
      table.rows.add(dataSet);
      table.draw(false);
    } else {
      $('#draftTable').DataTable({
        data: dataSet,
        scrollX: true,
        autoWidth: false,
        destroy: true,
        pageLength: 25,
        order: [[0, 'desc']],
        language: { url: '//cdn.datatables.net/plug-ins/2.3.2/i18n/es-MX.json' },
        dom: '<"row mb-2"<"col-sm-6"l><"col-sm-6"f>>tip',
        columnDefs: [
          { targets: [9, 16, 17, 18], orderable: false },
          { targets: [9, 16, 17, 18], className: 'text-nowrap text-center' }
        ],
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

  // ================================
  // CARDS (MÓVIL)
  // ================================
  function updateCards(filtered) {
    const cont = document.getElementById('draft-cards');
    if (!filtered.length) {
      cont.innerHTML = `<div class="text-center text-muted">Sin jugadores.</div>`;
      return;
    }

    const maxProj = Math.max(...filtered.map(p => Number(p.projection) || 0)) || 1;

    cont.innerHTML = `
      <div class="row g-2">
        ${filtered.map(p => {
          const risk = (p.riskTags || []).join(', ');
          const prio = (p.priorityScore ?? '') + '';
          const projPct = Math.min(100, (Number(p.projection||0)/maxProj)*100);
          return `
            <div class="col-12">
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

  // ================================
  // REFRESH (aplica filtro, cards + tabla)
  // ================================
  function refreshUI(data) {
    const statusFilter = statusSelect.value;
    const filtered = data.filter(p => statusFilter === 'TODOS' || (p.status || '').toLowerCase().trim() === 'libre');

    renderSummary(filtered);
    updateCards(filtered);
    updateTable(filtered);
  }

  // ================================
  // CARGA DE DATOS
  // ================================
  async function loadDraftData() {
    try {
      const leagueId = leagueSelect.value;
      const position = positionSelect.value;
      const byeCondition = byeInput.value || 0;
      const idExpert = expertSelect.selectedOptions[0]?.dataset.id || '';
      const sleeperADP = sleeperADPCheckbox.checked;

      showLoadingBar(true);
      draftData = await fetchDraftData({ leagueId, position, idExpert, byeCondition, sleeperADP });
      refreshUI(draftData);
    } catch (err) {
      console.error(err);
      showError('Error al cargar el draft.');
    } finally {
      showLoadingBar(false);
    }
  }

  // Carga inicial
  loadDraftData();
}
