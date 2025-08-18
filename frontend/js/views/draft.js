import { fetchDraftData } from '../api.js';
import { positions } from '../../components/constants.js';
import { showError, showLoadingBar } from '../../components/alerts.js';
import { renderExpertSelect } from '../../components/selectExperts.js';
import { renderLeagueSelect } from '../../components/selectLeagues.js';

export default async function renderDraftView() {
  const content = document.getElementById('content-container');
  content.innerHTML = `
    <style>
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
        <div id="draft-cards" class="mb-2"></div>
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

  let draftData = [];

  // Colores de posición
  function getPositionColor(pos) {
    switch ((pos || '').toUpperCase()) {
      case 'RB': return 'bg-success text-white';
      case 'WR': return 'bg-primary text-white';
      case 'TE': return 'bg-warning text-dark';
      case 'QB': return 'bg-danger text-white';
      default: return 'bg-secondary text-white';
    }
  }
  const getPositionBadge = pos => `<span class="badge ${getPositionColor(pos)}">${pos ?? ''}</span>`;
  const safeNum = (v, d=2) => (typeof v === 'number' && Number.isFinite(v)) ? v.toFixed(d) : '';

  function getHeatColor(value, min, max) {
    if (value == null || isNaN(value) || max === min) return '#888';
    const ratio = (value - min) / (max - min);
    const r = Math.floor(255 * (1 - ratio));
    const g = Math.floor(255 * ratio);
    return `rgb(${r},${g},0)`;
  }

  function renderSummary(players) {
    const summary = { tiers: {}, steals: 0, risks: 0 };
    players.forEach(p => {
      const tierLabel = p.tier_global_label || 'Sin tier';
      summary.tiers[tierLabel] = (summary.tiers[tierLabel] || 0) + 1;
      if (p.valueTag === '💎 Steal') summary.steals++;
      if (p.riskTags?.length) summary.risks++;
    });
    document.getElementById('draft-summary').innerHTML = `
      <div class="d-flex gap-3 flex-wrap">
        ${Object.entries(summary.tiers).map(([tier, count]) => `<span class="badge bg-info">${tier}: ${count}</span>`).join('')}
        <span class="badge bg-success">Steals: ${summary.steals}</span>
        <span class="badge bg-warning text-dark">Riesgos: ${summary.risks}</span>
      </div>`;
  }

  function updateCards(players) {
    if (!players.length) {
      cardsContainer.innerHTML = `<div class="text-center text-muted">Sin jugadores.</div>`;
      return;
    }
    const maxProj = Math.max(...players.map(p => Number(p.projection) || 0)) || 1;
    const minPrio = Math.min(...players.map(p => Number(p.priorityScore) || 0));
    const maxPrio = Math.max(...players.map(p => Number(p.priorityScore) || 0));

    cardsContainer.innerHTML = `
      <div class="row g-2">
        ${players.map(p => {
          const projPct = Math.min(100, (Number(p.projection||0)/maxProj)*100);
          const prioStyle = `background-color:${getHeatColor(p.priorityScore,minPrio,maxPrio)};color:#fff;padding:0 6px;border-radius:6px;font-weight:700;`;
          return `
            <div class="col-12 col-md-4 col-lg-3">
              <div class="draft-card">
                <div class="title-row">
                  <div class="player">${p.nombre ?? ''}</div>
                  <span class="badge" style="${prioStyle}">Prio: ${p.priorityScore ?? ''}</span>
                </div>
                <div class="meta mb-2">
                  ${getPositionBadge(p.position)}
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
                  <span><strong>VOR:</strong> ${safeNum(p.vor)}</span>
                  <span><strong>Adj VOR:</strong> ${safeNum(p.adjustedVOR)}</span>
                  <span><strong>Drop:</strong> ${p.dropoff ?? ''}</span>
                  <span><strong>Val/ADP:</strong> ${safeNum(p.valueOverADP)}</span>
                </div>
                <div class="mt-2 d-flex flex-wrap gap-2">
                  ${p.valueTag ? `<span class="badge bg-success">${p.valueTag}</span>` : ''}
                  ${p.riskTags?.length ? `<span class="badge bg-warning text-dark">${p.riskTags.join(', ')}</span>` : ''}
                  ${p.tier_global_label ? `<span class="badge bg-danger">${p.tier_global} ${p.tier_global_label}</span>` : ''}
                  ${p.tier_pos_label ? `<span class="badge bg-primary">${p.tier_pos} ${p.tier_pos_label}</span>` : ''}
                </div>
              </div>
            </div>`;}).join('')}
      </div>`;
  }

  function refreshUI(data) {
    const statusFilter = statusSelect.value;
    const filtered = data.filter(p => statusFilter === 'TODOS' || (p.status||'').toLowerCase().trim()==='libre');
    const sorted = filtered.sort((a,b) => (Number(a.rank)||9999)-(Number(b.rank)||9999));
    renderSummary(sorted);
    updateCards(sorted);
  }

  async function loadDraftData() {
    try {
      const leagueId = leagueSelect.value;
      const position = positionSelect.value;
      const byeCondition = byeInput.value || 0;
      const idExpert = expertSelect.value;
      const sleeperADP = sleeperADPCheckbox.checked;
      if (!leagueId || !idExpert) return showError('Selecciona una liga y un experto');

      showLoadingBar('Actualizando draft', 'Descargando datos más recientes...');
      const { players, params } = await fetchDraftData(leagueId, position, byeCondition, idExpert, sleeperADP);
      Swal.close();
      if (!players.length) return showError('No se encontraron jugadores.');

      draftData = players;
      refreshUI(draftData);

      if (params?.ranks_published) {
        const fecha = new Date(params.ranks_published);
        document.getElementById('ranks-updated-label').innerHTML = `Ranks: ${fecha.toLocaleString('es-MX')}`;
      }
      if (params?.ADPdate) {
        const fecha = new Date(params.ADPdate);
        document.getElementById('adp-updated-label').innerHTML = `ADP: ${fecha.toLocaleDateString('es-MX')}`;
      }
    } catch (err) {
      Swal.close();
      console.error(err);
      showError('Error al actualizar draft: ' + err.message);
    }
  }

  // Eventos
  statusSelect.addEventListener('change', () => refreshUI(draftData));
  sleeperADPCheckbox.addEventListener('change', loadDraftData);
  positionSelect.addEventListener('change', loadDraftData);
  document.getElementById('btn-update-draft').addEventListener('click', loadDraftData);

  // Init selects
  await renderExpertSelect('#select-expert');
  await renderLeagueSelect('#select-league');

  // Auto-load si hay valores guardados
  loadDraftData();
}
