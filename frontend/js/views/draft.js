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
      #draft-cards .draft-card {
        background: var(--bg-secondary, #1e1e1e);
        color: var(--text-primary, #f8f9fa);
        border: 1px solid rgba(255,255,255,.08);
        border-radius: .75rem;
        padding: 1rem;
        height: 100%;
      }
      #draft-cards .player { font-weight:600; font-size:1rem; }
      #draft-cards .meta { font-size:.85rem; opacity:.9; display:flex; flex-wrap:wrap; gap:.5rem 1rem; }
      #draft-cards .progress { height:8px; background: rgba(255,255,255,.1); }
      #draft-cards .progress-bar { background:#0dcaf0; }
      .pagination-controls { display:flex; justify-content:center; gap:.5rem; margin:1rem 0; }
    </style>

    <div class="card border-0 shadow-sm">
      <div class="card-body">
        <h4 class="mb-3 d-flex align-items-center gap-2">
          <i class="bi bi-clipboard-data text-info"></i> Draft Inteligente
        </h4>

        <div class="row g-2 mb-3">
          <div class="col-md-3"><select id="select-league" class="form-select"></select></div>
          <div class="col-md-3"><select id="select-expert" class="form-select"></select></div>
          <div class="col-md-2">
            <select id="select-position" class="form-select">
              <option value="ALL">Todas</option>
              ${positions.map(p => `<option value="${p.nombre}">${p.nombre}</option>`).join('')}
            </select>
          </div>
          <div class="col-md-4">
            <input type="text" id="search-input" class="form-control" placeholder="Buscar jugador...">
          </div>
        </div>

        <div id="draft-cards" class="row g-2"></div>
        <div class="pagination-controls">
          <button id="prev-page" class="btn btn-sm btn-outline-info">Anterior</button>
          <span id="page-info" class="align-self-center"></span>
          <button id="next-page" class="btn btn-sm btn-outline-info">Siguiente</button>
        </div>
      </div>
    </div>
  `;

  const leagueSelect = document.getElementById('select-league');
  const expertSelect = document.getElementById('select-expert');
  const positionSelect = document.getElementById('select-position');
  const searchInput = document.getElementById('search-input');
  const cardsContainer = document.getElementById('draft-cards');
  const prevBtn = document.getElementById('prev-page');
  const nextBtn = document.getElementById('next-page');
  const pageInfo = document.getElementById('page-info');

  let draftData = [];
  let filteredData = [];
  let currentPage = 1;
  const pageSize = 12;

  // ======================
  // RENDER CARDS
  // ======================
  function renderCards() {
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    const players = filteredData.slice(start, end);

    if (!players.length) {
      cardsContainer.innerHTML = `<div class="text-center text-muted">Sin jugadores.</div>`;
      pageInfo.textContent = '';
      return;
    }

    cardsContainer.innerHTML = players.map(p => {
      const projPct = Math.min(100, (Number(p.projection||0)/Math.max(...filteredData.map(x=>x.projection||1)))*100);
      return `
        <div class="col-12 col-md-6 col-lg-4">
          <div class="draft-card">
            <div class="d-flex justify-content-between mb-1">
              <div class="player">${p.nombre}</div>
              <span class="badge bg-secondary">${p.position}</span>
            </div>
            <div class="meta mb-2">
              <span><i class="bi bi-shield"></i> ${p.team ?? ''}</span>
              <span><i class="bi bi-trophy"></i> Rank ${p.rank ?? ''}</span>
              <span><i class="bi bi-bar-chart"></i> ADP ${p.adpValue ?? ''}</span>
              <span><i class="bi bi-diagram-3"></i> Ronda ${p.adpRound ?? ''}</span>
            </div>
            <div class="mb-2">
              <div class="small">Proyección</div>
              <div class="progress"><div class="progress-bar" style="width:${projPct}%"></div></div>
            </div>
            <div class="meta">
              <span><strong>VOR:</strong> ${p.vor ?? ''}</span>
              <span><strong>Adj:</strong> ${p.adjustedVOR ?? ''}</span>
              <span><strong>Drop:</strong> ${p.dropoff ?? ''}</span>
            </div>
          </div>
        </div>`;
    }).join('');

    const totalPages = Math.ceil(filteredData.length / pageSize);
    pageInfo.textContent = `Página ${currentPage} de ${totalPages}`;
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages;
  }

  // ======================
  // FILTRADO
  // ======================
  function applyFilters() {
    const pos = positionSelect.value;
    const search = searchInput.value.toLowerCase();

    filteredData = draftData.filter(p => {
      const matchesPos = pos === 'ALL' || p.position === pos;
      const matchesSearch = !search || (p.nombre ?? '').toLowerCase().includes(search);
      return matchesPos && matchesSearch;
    });

    currentPage = 1;
    renderCards();
  }

  // ======================
  // EVENTOS
  // ======================
  searchInput.addEventListener('input', () => applyFilters());
  positionSelect.addEventListener('change', () => applyFilters());
  prevBtn.addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderCards(); }});
  nextBtn.addEventListener('click', () => { if (currentPage < Math.ceil(filteredData.length/pageSize)) { currentPage++; renderCards(); }});

  // ======================
  // LOAD DATA
  // ======================
  async function loadDraftData() {
    try {
      showLoadingBar(true);
      const leagueId = leagueSelect.value;
      const expertId = expertSelect.value;
      const data = await fetchDraftData({ leagueId, expertId });
      draftData = data || [];
      applyFilters();
    } catch (err) {
      console.error(err);
      showError('Error cargando jugadores');
    } finally {
      showLoadingBar(false);
    }
  }

  // inicializar selects
  await renderLeagueSelect('#select-league', { onChange: loadDraftData });
  await renderExpertSelect('#select-expert', { onChange: loadDraftData });
}
