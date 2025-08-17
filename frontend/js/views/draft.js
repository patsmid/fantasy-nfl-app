// draft.simple.js
import { fetchDraftData } from '../api.js';
import { positions } from '../../components/constants.js';
import { showError, showLoadingBar } from '../../components/alerts.js';
import { renderExpertSelect } from '../../components/selectExperts.js';
import { renderLeagueSelect } from '../../components/selectLeagues.js';

export default async function renderDraftView() {
  const content = document.getElementById('content-container');
  content.innerHTML = `
    <style>
      /* Minimal, readable card layout */
      #draft-cards .draft-card {
        background: var(--bg-secondary, #0f1720);
        color: var(--text-primary, #eef2f6);
        border: 1px solid rgba(255,255,255,.06);
        border-radius: 12px;
        padding: 14px;
        height: 100%;
        display:flex;
        flex-direction:column;
        gap:8px;
      }
      #draft-cards .player { font-weight:700; font-size:1.02rem; line-height:1.1; }
      #draft-cards .meta { font-size:.86rem; opacity:.92; display:flex; flex-wrap:wrap; gap:6px 10px; }
      .small-muted { font-size:.78rem; opacity:.7 }
      .summary-badges { display:flex; gap:.5rem; flex-wrap:wrap; margin-bottom:8px }
      .pagination-controls { display:flex; justify-content:center; gap:.5rem; margin:12px 0; align-items:center }

      /* Responsive grid tweaks */
      @media (max-width:599px) {
        #draft-cards .col { padding-left:6px; padding-right:6px }
      }
    </style>

    <div class="card border-0 shadow-sm">
      <div class="card-body">
        <div class="d-flex align-items-center justify-content-between mb-3 gap-2">
          <h4 class="m-0 d-flex align-items-center gap-2"><i class="bi bi-clipboard-data text-info"></i> Draft Inteligente</h4>
          <div>
            <button id="btn-update-draft" class="btn btn-sm btn-outline-info">Actualizar</button>
          </div>
        </div>

        <div class="row g-2 mb-3">
          <div class="col-12 col-md-4">
            <select id="select-league" class="form-select"></select>
          </div>
          <div class="col-12 col-md-4">
            <select id="select-expert" class="form-select"></select>
          </div>
          <div class="col-6 col-md-2">
            <select id="select-position" class="form-select">
              <option value="ALL">Todas</option>
              ${positions.map(p => `<option value="${p.nombre}">${p.nombre}</option>`).join('')}
            </select>
          </div>
          <div class="col-6 col-md-2">
            <input id="search-input" class="form-control" placeholder="Buscar jugador, equipo...">
          </div>
        </div>

        <div id="summary" class="summary-badges"></div>

        <div id="draft-cards" class="row g-2"></div>

        <div class="d-flex justify-content-between align-items-center mt-3">
          <div>
            <label class="small-muted">Mostrar por página</label>
            <select id="page-size" class="form-select form-select-sm" style="width:110px; display:inline-block; margin-left:8px">
              <option value="8">8</option>
              <option value="12" selected>12</option>
              <option value="24">24</option>
            </select>
          </div>
          <div class="pagination-controls">
            <button id="prev-page" class="btn btn-sm btn-outline-info">Anterior</button>
            <div id="page-info" class="small-muted"></div>
            <button id="next-page" class="btn btn-sm btn-outline-info">Siguiente</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // DOM refs
  const leagueSelect = document.getElementById('select-league');
  const expertSelect = document.getElementById('select-expert');
  const positionSelect = document.getElementById('select-position');
  const searchInput = document.getElementById('search-input');
  const cardsContainer = document.getElementById('draft-cards');
  const summaryContainer = document.getElementById('summary');
  const prevBtn = document.getElementById('prev-page');
  const nextBtn = document.getElementById('next-page');
  const pageInfo = document.getElementById('page-info');
  const pageSizeSelect = document.getElementById('page-size');
  const btnUpdate = document.getElementById('btn-update-draft');

  // Estado
  let draftData = [];
  let filteredData = [];
  let currentPage = Number(localStorage.getItem('draft_currentPage') || 1);
  let pageSize = Number(localStorage.getItem('draft_pageSize') || pageSizeSelect.value || 12);

  pageSizeSelect.value = String(pageSize);

  // Utiles
  const safeNum = (v, d = 2) => (typeof v === 'number' && Number.isFinite(v)) ? Number(v.toFixed(d)) : (v || '');
  const debounce = (fn, wait = 250) => {
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
  };
  const getPositionBadge = (pos) => `<span class="badge ${pos==='RB'? 'bg-success': pos==='WR'? 'bg-primary': pos==='TE'? 'bg-warning text-dark': pos==='QB'? 'bg-danger':''}">${pos||''}</span>`;

  // Update summary badges (tiers / steals / risks)
  function renderSummary(players) {
    const counts = {};
    let steals = 0, risks = 0;
    players.forEach(p => {
      const label = p.tier_global_label || (p.tier_global ? `Tier ${p.tier_global}` : 'Sin tier');
      counts[label] = (counts[label] || 0) + 1;
      if (p.valueTag && String(p.valueTag).toLowerCase().includes('steal')) steals++;
      if (p.riskTags && p.riskTags.length) risks++;
    });

    const badges = Object.entries(counts)
      .map(([k,v]) => `<span class="badge bg-info">${k}: ${v}</span>`)
      .join(' ');

    summaryContainer.innerHTML = `${badges} <span class="badge bg-success ms-1">Steals: ${steals}</span> <span class="badge bg-warning text-dark ms-1">Riesgos: ${risks}</span>`;
  }

  // RENDER CARDS
  function renderCards() {
    const total = filteredData.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (currentPage > totalPages) currentPage = totalPages;

    const start = (currentPage - 1) * pageSize;
    const pagePlayers = filteredData.slice(start, start + pageSize);

    if (!pagePlayers.length) {
      cardsContainer.innerHTML = `<div class="text-center text-muted">Sin jugadores.</div>`;
      pageInfo.textContent = ``;
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      return;
    }

    const maxProj = Math.max(...filteredData.map(p => Number(p.projection || 0)), 1);

    cardsContainer.innerHTML = pagePlayers.map(p => {
      const projPct = Math.round(Math.min(100, (Number(p.projection || 0) / maxProj) * 100));
      const risk = (p.riskTags || []).join(', ');
      return `
        <div class="col-12 col-md-6 col-lg-4 col-xl-3">
          <div class="draft-card">
            <div class="d-flex justify-content-between align-items-start">
              <div class="player">${p.nombre || ''}</div>
              <div>${getPositionBadge(p.position)}</div>
            </div>

            <div class="meta">
              <span><i class="bi bi-shield"></i> ${p.team || ''}</span>
              <span><i class="bi bi-calendar2-x"></i> Bye ${p.bye || ''}</span>
              <span><i class="bi bi-trophy"></i> Rank ${p.rank || ''}</span>
              <span><i class="bi bi-person-check"></i> ${p.status || ''}</span>
            </div>

            <div>
              <div class="small-muted">Proyección</div>
              <div class="progress mt-1" style="height:8px"><div class="progress-bar" role="progressbar" style="width:${projPct}%"></div></div>
            </div>

            <div class="meta">
              <span><strong>VOR:</strong> ${safeNum(p.vor)}</span>
              <span><strong>Adj:</strong> ${safeNum(p.adjustedVOR)}</span>
              <span><strong>Drop:</strong> ${p.dropoff || ''}</span>
              <span><strong>ADP:</strong> ${p.adpValue || ''}</span>
            </div>

            <div class="d-flex flex-wrap gap-2 mt-2">
              ${p.valueTag ? `<span class="badge bg-success">${p.valueTag}</span>` : ''}
              ${risk ? `<span class="badge bg-warning text-dark">${risk}</span>` : ''}
              ${p.tier_global_label ? `<span class="badge bg-danger">${p.tier_global_label}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    pageInfo.textContent = `Página ${currentPage} de ${totalPages} — ${total} jugadores`;
    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= totalPages;

    // persist page state
    localStorage.setItem('draft_currentPage', String(currentPage));
    localStorage.setItem('draft_pageSize', String(pageSize));

    renderSummary(filteredData);
  }

  // FILTRADO
  function applyFilters() {
    const pos = positionSelect.value;
    const q = (searchInput.value || '').trim().toLowerCase();

    filteredData = draftData.filter(p => {
      const matchesPos = pos === 'ALL' || (p.position || '').toUpperCase() === (pos || '').toUpperCase();
      const hay = `${p.nombre || ''} ${p.team || ''} ${p.position || ''}`.toLowerCase();
      const matchesSearch = !q || hay.includes(q);
      return matchesPos && matchesSearch;
    });

    currentPage = 1;
    renderCards();
  }

  // LOAD DATA
  async function loadDraftData() {
    try {
      const leagueId = leagueSelect.value;
      const expertId = expertSelect.value;
      const position = positionSelect.value;
      if (!leagueId || !expertId) return showError('Selecciona liga y experto');

      try { showLoadingBar('Cargando draft', 'Descargando datos...'); } catch (e) {}

      // Ajusta la firma si tu fetchDraftData espera más params: (leagueId, position, bye, expertId, sleeperADP)
      const byeCondition = 0;
      const sleeperADP = false;
      const resp = await fetchDraftData(leagueId, position === 'ALL' ? null : position, byeCondition, expertId, sleeperADP);

      // fetchDraftData debe devolver { players, params } o directamente un array. Aceptamos ambas.
      const players = Array.isArray(resp) ? resp : (resp?.players || []);

      draftData = players || [];
      applyFilters();
    } catch (err) {
      console.error('loadDraftData error', err);
      try { Swal.close(); } catch (e) {}
      showError('Error cargando jugadores');
    } finally {
      try { Swal.close(); } catch (e) {}
    }
  }

  // EVENTOS
  const debouncedSearch = debounce(() => applyFilters(), 220);
  searchInput.addEventListener('input', debouncedSearch);
  positionSelect.addEventListener('change', () => { localStorage.setItem('draft_position', positionSelect.value); applyFilters(); });
  pageSizeSelect.addEventListener('change', () => { pageSize = Number(pageSizeSelect.value || 12); currentPage = 1; renderCards(); });
  prevBtn.addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderCards(); }});
  nextBtn.addEventListener('click', () => { const maxP = Math.ceil(filteredData.length / pageSize); if (currentPage < maxP) { currentPage++; renderCards(); }});
  btnUpdate.addEventListener('click', loadDraftData);

  // Inicializar selects con helpers que ya tienes (asumen retornar instancia o autocontrol)
  await renderLeagueSelect('#select-league', { onChange: loadDraftData });
  await renderExpertSelect('#select-expert', { onChange: loadDraftData });

  // Restaurar filtros guardados
  const savedPos = localStorage.getItem('draft_position');
  if (savedPos) positionSelect.value = savedPos;

  // Cargar si ya hay liga+experto
  if (leagueSelect.value && expertSelect.value) await loadDraftData();
}
