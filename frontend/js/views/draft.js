// frontend/src/views/draftConsenso.js
import { showSuccess, showError, showLoadingBar } from '../../components/alerts.js';
import { positions } from '../../components/constants.js';
import { renderLeagueSelect } from '../../components/selectLeagues.js';
import { fetchConsensusData } from '../api.js';

export default async function renderConsensusDraft() {
  const content = document.getElementById('content-container');
  if (!content) return showError('No se encontró el contenedor de contenido.');

  content.innerHTML = `
    <style>
      .draft-card { background:var(--bg-secondary,#1f2228); color:var(--text-primary,#e4e6eb); border:1px solid var(--border,#2f3033); border-radius:12px; padding:.75rem; height:100%; }
      .pos-badge { padding:.2rem .5rem; border-radius:.35rem; font-weight:600; display:inline-block; }
      .controls-row { display:flex; gap:.5rem; flex-wrap:wrap; align-items:center; margin-bottom:.75rem; }
      .small-muted { font-size:.85rem; color:var(--text-secondary,#b0b3b8); }
      .pagination-controls { display:flex; gap:.4rem; align-items:center; }
      .page-btn { min-width:36px; text-align:center; padding:.2rem .5rem; cursor:pointer; border-radius:.35rem; border:1px solid rgba(255,255,255,.06); background:transparent; color:inherit; }
      .page-btn[disabled] { opacity:.45; cursor:not-allowed; }
    </style>

    <div class="card border-0 shadow-sm rounded flock-card">
      <div class="card-body d-flex flex-column min-h-0">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h4 class="m-0 d-flex align-items-center gap-2">
            <i class="bi bi-list-stars text-warning"></i> Draft – Consenso (Inteligente)
          </h4>
          <div class="d-flex gap-2">
            <button id="btn-refresh-draft" class="btn btn-sm btn-outline-light"><i class="bi bi-arrow-clockwise"></i> Actualizar</button>
          </div>
        </div>

        <form class="row g-3 mb-3">
          <div class="col-md-3">
            <label class="form-label">Liga</label>
            <select id="select-league" class="form-select"></select>
          </div>
          <div class="col-md-2">
            <label class="form-label">Posición</label>
            <select id="select-position" class="form-select">
              <option value="ALL">ALL</option>
              ${positions.map(p => `<option value="${p.nombre}">${p.nombre}</option>`).join('')}
            </select>
          </div>
          <div class="col-md-2">
            <label class="form-label">Status</label>
            <select id="select-status" class="form-select">
              <option value="LIBRE">LIBRE</option>
              <option value="TODOS">TODOS</option>
            </select>
          </div>
          <div class="col-md-2">
            <label class="form-label">Bye condición</label>
            <input id="input-bye" type="number" class="form-control" placeholder="0">
          </div>
          <div class="col-md-2 d-flex align-items-end">
            <div class="form-check">
              <input id="chk-sleeperADP" class="form-check-input" type="checkbox">
              <label class="form-check-label">Sleeper ADP</label>
            </div>
          </div>
        </form>

        <div class="d-flex flex-wrap gap-2 align-items-center mb-2">
          <div id="ranks-updated-label" class="small-muted"></div>
          <div id="adp-updated-label" class="small-muted"></div>
        </div>

        <div class="controls-row mb-2">
          <input id="draft-search" class="form-control form-control-sm" placeholder="Buscar por nombre, equipo, posición..." style="min-width:220px;">
          <div style="margin-left:auto; display:flex; gap:.5rem; align-items:center;">
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
              <select id="draft-sort-by" class="form-select form-select-sm ms-1" style="width:auto; display:inline-block;">
                <option value="avg_rank">Avg Rank</option>
                <option value="adp_rank">ADP Rank</option>
                <option value="valueOverADP">Value/ADP</option>
                <option value="shark">SharkScore 🦈</option>
              </select>
            </label>
            <label class="m-0 ms-2">Dir
              <select id="draft-sort-dir" class="form-select form-select-sm ms-1" style="width:auto; display:inline-block;">
                <option value="asc">Asc</option>
                <option value="desc">Desc</option>
              </select>
            </label>
          </div>
        </div>

        <div id="ranksummary" class="mb-3"></div>

        <div id="draft-grid" class="row g-3"></div>
        <div id="draft-empty" class="text-center text-secondary py-4 d-none">
          <i class="bi bi-inbox"></i>
          <div class="mt-2">No hay jugadores que coincidan con los filtros.</div>
        </div>

        <div class="d-flex justify-content-between align-items-center mt-3">
          <div id="cards-info" class="text-muted small"></div>
          <div id="pagination" class="pagination-controls"></div>
        </div>
      </div>
    </div>

    <div class="offcanvas offcanvas-end flock-offcanvas" tabindex="-1" id="offcanvasDrafted">
      <div class="offcanvas-header border-secondary">
        <h5 class="offcanvas-title d-flex align-items-center gap-2">
          <i class="bi bi-people-fill text-flock"></i>
          Mi equipo · <span id="drafted-count" class="badge bg-primary">0</span>
        </h5>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="offcanvas" aria-label="Close"></button>
      </div>
      <div class="offcanvas-body">
        <div id="drafted-list"></div>
      </div>
      <div class="offcanvas-footer p-3 border-top border-secondary d-flex gap-2 justify-content-end">
        <button class="btn btn-outline-light" data-bs-dismiss="offcanvas">Cerrar</button>
      </div>
    </div>
  `;

  // -------------------------
  // Refs y estado
  // -------------------------
  const leagueSelect = document.getElementById('select-league');
  const positionSelect = document.getElementById('select-position');
  const statusSelect = document.getElementById('select-status');
  const byeInput = document.getElementById('input-bye');
  const sleeperADPCheckbox = document.getElementById('chk-sleeperADP');
  const searchInput = document.getElementById('draft-search');
  const pageSizeSel = document.getElementById('page-size');
  const sortBySel = document.getElementById('draft-sort-by');
  const sortDirSel = document.getElementById('draft-sort-dir');
  const grid = document.getElementById('draft-grid');
  const empty = document.getElementById('draft-empty');
  const ranksUpdatedLabel = document.getElementById('ranks-updated-label');
  const adpUpdatedLabel = document.getElementById('adp-updated-label');
  const btnRefresh = document.getElementById('btn-refresh-draft');
  const cardsInfo = document.getElementById('cards-info');
  const paginationEl = document.getElementById('pagination');

  let draftData = [];
  let filtered = [];
  let myDrafted = [];
  let currentPage = 1;
  let pageSize = Number(pageSizeSel.value) || 12;

  // -------------------------
  // Helpers
  // -------------------------
  const safeNum = v => (v == null || isNaN(Number(v))) ? 0 : Number(v);
  const isFreeStatus = s => {
    const t = (s ?? '').toString().trim().toLowerCase();
    return !t || ['libre','free','fa','available','waiver'].includes(t);
  };
  const renderPosBadge = pos => {
    const colorMap = {QB:'#f5c518',RB:'#9b59b6',WR:'#1abc9c',TE:'#e67e22',K:'#e74c3c',DEF:'#3498db'};
    const bg = colorMap[pos] || '#777';
    const textColor = ['#f5c518','#e67e22','#e74c3c'].includes(bg) ? '#000' : '#fff';
    return `<span class="pos-badge" style="background:${bg};color:${textColor}">${pos}</span>`;
  };

  const paginate = (arr, page=1, size=12) => arr.slice((page-1)*size, page*size);

  const renderDraftGrid = () => {
    const data = paginate(filtered, currentPage, pageSize);
    grid.innerHTML = '';
    if (!data.length) { empty.classList.remove('d-none'); return; }
    empty.classList.add('d-none');

    for (const p of data) {
      grid.innerHTML += `
        <div class="col-sm-6 col-md-4 col-lg-3">
          <div class="draft-card d-flex flex-column justify-content-between">
            <div>
              <div class="d-flex justify-content-between align-items-start mb-1">
                <div><strong>${p.nombre}</strong> ${renderPosBadge(p.position)}</div>
                <div class="small-muted">${p.team} | Bye: ${p.bye || '-'}</div>
              </div>
              <div class="small-muted">
                Avg: ${safeNum(p.avg_rank).toFixed(1)} | ADP: ${safeNum(p.adp_rank).toFixed(1)} | Val/ADP: ${safeNum(p.valueOverADP).toFixed(2)}
              </div>
              ${p.experts?.length ? `<div class="mt-2 small-muted">${p.experts.map(e => `${e.expert} (${safeNum(e.rank).toFixed(1)})`).join(', ')}</div>` : ''}
            </div>
          </div>
        </div>
      `;
    }

    // Info
    cardsInfo.textContent = `Mostrando ${data.length} de ${filtered.length} jugadores.`;
    renderPagination();
  };

  const renderPagination = () => {
    const totalPages = Math.ceil(filtered.length / pageSize);
    paginationEl.innerHTML = '';
    if (totalPages <= 1) return;

    const btn = (label, page, disabled=false) =>
      `<button class="page-btn" ${disabled?'disabled':''} data-page="${page}">${label}</button>`;

    paginationEl.innerHTML += btn('«', 1, currentPage===1);
    paginationEl.innerHTML += btn('‹', Math.max(1,currentPage-1), currentPage===1);

    for (let i=1;i<=totalPages;i++){
      paginationEl.innerHTML += `<button class="page-btn ${i===currentPage?'fw-bold':''}" data-page="${i}">${i}</button>`;
    }

    paginationEl.innerHTML += btn('›', Math.min(totalPages,currentPage+1), currentPage===totalPages);
    paginationEl.innerHTML += btn('»', totalPages, currentPage===totalPages);

    // Listener
    paginationEl.querySelectorAll('.page-btn').forEach(b => {
      b.addEventListener('click', ()=> {
        const p = Number(b.dataset.page);
        if (p && p!==currentPage){ currentPage = p; renderDraftGrid(); }
      });
    });
  };

  const applyFilters = () => {
    const pos = positionSelect.value;
    const status = statusSelect.value;
    const byeCond = Number(byeInput.value) || 0;
    const search = searchInput.value.trim().toLowerCase();

    filtered = draftData.filter(p => {
      if(pos!=='ALL' && p.position !== pos) return false;
      if(status==='LIBRE' && !isFreeStatus(p.status)) return false;
      if(byeCond>0 && p.bye === byeCond) return false;
      if(search && !p.nombre.toLowerCase().includes(search) && !p.team.toLowerCase().includes(search)) return false;
      return true;
    });

    const sortBy = sortBySel.value;
    const dir = sortDirSel.value==='asc'?1:-1;
    filtered.sort((a,b)=> (safeNum(a[sortBy]) - safeNum(b[sortBy]))*dir );

    currentPage = 1;
    renderDraftGrid();
  };

  // -------------------------
  // Load data
  // -------------------------
  const loadConsensus = async () => {
    showLoadingBar(true);
    try {
      const leagueId = leagueSelect.value;
      const sleeperADP = sleeperADPCheckbox.checked;

      const res = await fetchConsensusData(leagueId, { sleeperADP });
      draftData = res.data || [];
      myDrafted = []; // opcional si quieres mostrar drafteados desde API
      ranksUpdatedLabel.textContent = res.ranksUpdated ? `Ranks: ${res.ranksUpdated}` : '';
      adpUpdatedLabel.textContent = res.adpUpdated ? `ADP: ${res.adpUpdated}` : '';
      applyFilters();
      showSuccess('Datos de consenso cargados');
    } catch(e){
      showError('Error cargando datos de consenso');
      console.error(e);
    } finally{
      showLoadingBar(false);
    }
  };

  // -------------------------
  // Event listeners
  // -------------------------
  leagueSelect.addEventListener('change', loadConsensus);
  positionSelect.addEventListener('change', applyFilters);
  statusSelect.addEventListener('change', applyFilters);
  byeInput.addEventListener('input', applyFilters);
  searchInput.addEventListener('input', applyFilters);
  pageSizeSel.addEventListener('change', ()=>{ pageSize=Number(pageSizeSel.value)||12; renderDraftGrid(); });
  sortBySel.addEventListener('change', applyFilters);
  sortDirSel.addEventListener('change', applyFilters);
  sleeperADPCheckbox.addEventListener('change', loadConsensus);
  btnRefresh.addEventListener('click', loadConsensus);

  // -------------------------
  // Initialize league select
  // -------------------------
  await renderLeagueSelect(leagueSelect);

  // Carga inicial
  await loadConsensus();
}
