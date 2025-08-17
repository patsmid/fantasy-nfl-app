import { fetchDraftData } from '../api.js';
import { positions } from '../../components/constants.js';
import { showError, showLoadingBar } from '../../components/alerts.js';
import { renderExpertSelect } from '../../components/selectExperts.js';
import { renderLeagueSelect } from '../../components/selectLeagues.js';

export default async function renderDraftView() {
  const content = document.getElementById("content-container");

  content.innerHTML = `
  <style>
    .draft-card {
      background: var(--bg-secondary, #1e1e1e);
      color: var(--text-primary, #f8f9fa);
      border: 1px solid var(--border, rgba(255,255,255,.08));
      border-radius: .75rem;
      padding: 1rem;
      height: 100%;
      display:flex;
      flex-direction:column;
      justify-content:space-between;
      transition: transform .2s;
    }
    .draft-card:hover { transform: scale(1.03); }

    .draft-card .title {
      font-weight: 600;
      font-size: 1rem;
      margin-bottom: .5rem;
      display:flex;
      justify-content:space-between;
      align-items:center;
      flex-wrap:wrap;
      gap:.5rem;
    }
    .draft-card .meta {
      font-size: .85rem;
      display: flex;
      flex-wrap: wrap;
      gap:.35rem .75rem;
      margin-bottom:.5rem;
    }
    .draft-card .progress { height: 8px; background: rgba(255,255,255,.1); border-radius:.4rem; overflow:hidden; }
    .draft-card .progress-bar { background: #0dcaf0; height:100%; transition: width .3s; }
    .badge-custom { font-size:.75rem; font-weight:500; padding:.25rem .45rem; border-radius:.5rem; }

    .pagination { display:flex; justify-content:center; gap:.5rem; flex-wrap:wrap; margin-top:1rem; }
    .pagination button {
      background: var(--bg-secondary);
      color: var(--text-primary);
      border: 1px solid var(--border);
      border-radius: .4rem;
      padding: .25rem .6rem;
      cursor:pointer;
      transition: all .2s;
    }
    .pagination button.active {
      background: var(--accent,#0dcaf0);
      color:#fff;
      border:none;
    }
    .pagination button:hover { opacity:.8; }

    @media(max-width:768px){ .draft-card{font-size:.85rem;} }
  </style>

  <div class="card border-0 shadow-sm rounded">
    <div class="card-body">
      <h4 class="mb-3 d-flex align-items-center gap-2">
        <i class="bi bi-clipboard-data text-info"></i> Draft Inteligente
      </h4>

      <!-- Filtros -->
      <form class="row g-3 mb-3">
        <div class="col-md-3">
          <label class="form-label">Liga</label>
          <select id="select-league" class="form-select"></select>
        </div>
        <div class="col-md-2">
          <label class="form-label">Posición</label>
          <select id="select-position" class="form-select">
            <option value="">Todas</option>
            ${positions.map(p => `<option value="${p.nombre}">${p.nombre}</option>`).join("")}
          </select>
        </div>
        <div class="col-md-3">
          <label class="form-label">Experto</label>
          <select id="select-expert" class="form-select"></select>
        </div>
        <div class="col-md-2">
          <label class="form-label">Status</label>
          <select id="select-status" class="form-select">
            <option value="LIBRE">LIBRE</option>
            <option value="TODOS">TODOS</option>
          </select>
        </div>
        <div class="col-md-2">
          <label class="form-label">Bye</label>
          <input type="number" id="input-bye" class="form-control" placeholder="0">
        </div>
      </form>

      <!-- Búsqueda -->
      <div class="mb-3">
        <input id="search-input" class="form-control" placeholder="Buscar jugador...">
      </div>

      <!-- Contenedor cards -->
      <div id="draft-cards" class="row g-3"></div>

      <!-- Paginación -->
      <div id="pagination" class="pagination"></div>
    </div>
  </div>
  `;

  // =====================
  // Estado
  // =====================
  let draftData = [];
  let filteredData = [];
  let currentPage = 1;
  const pageSize = 12;

  // Refs
  const cardsContainer = document.getElementById("draft-cards");
  const pagination = document.getElementById("pagination");
  const searchInput = document.getElementById("search-input");
  const statusSelect = document.getElementById("select-status");
  const positionSelect = document.getElementById("select-position");
  const leagueSelect = document.getElementById("select-league");
  const expertSelect = document.getElementById("select-expert");
  const byeInput = document.getElementById("input-bye");

  // =====================
  // Funciones
  // =====================
  function saveFilters() {
    const filters = {
      status: statusSelect.value,
      position: positionSelect.value,
      bye: byeInput.value,
      search: searchInput.value,
      league: leagueSelect.value,
      expert: expertSelect.value
    };
    localStorage.setItem("draftFilters", JSON.stringify(filters));
  }

  function loadFilters() {
    const saved = JSON.parse(localStorage.getItem("draftFilters") || "{}");
    if(saved.status) statusSelect.value = saved.status;
    if(saved.position) positionSelect.value = saved.position;
    if(saved.bye) byeInput.value = saved.bye;
    if(saved.search) searchInput.value = saved.search;
    if(saved.league) leagueSelect.value = saved.league;
    if(saved.expert) expertSelect.value = saved.expert;
  }

  function renderCards(players) {
    if (!players.length) {
      cardsContainer.innerHTML = `<div class="text-muted text-center">Sin jugadores</div>`;
      pagination.innerHTML = "";
      return;
    }

    const maxProj = Math.max(...players.map(x => Number(x.projection)||0)) || 1;

    cardsContainer.innerHTML = players.map(p => {
      const projPct = Math.min(100, (Number(p.projection || 0) / maxProj) * 100);

      // Badges con colores según VOR
      const vorBadge = p.vor > 15 ? 'bg-danger' : p.vor > 7 ? 'bg-warning text-dark' : 'bg-success';

      return `
        <div class="col-12 col-md-6 col-lg-4">
          <div class="draft-card">
            <div class="title">
              <span>${p.nombre}</span>
              <span class="badge badge-custom bg-info">Rank ${p.rank ?? "-"}</span>
            </div>

            <div class="meta">
              <span class="badge badge-custom bg-secondary">${p.position}</span>
              <span class="badge badge-custom bg-secondary">${p.team}</span>
              <span class="badge badge-custom bg-secondary">Bye ${p.bye}</span>
              <span class="badge badge-custom bg-secondary">ADP ${p.adpValue ?? "-"}</span>
            </div>

            <div>
              <div class="small mb-1">Proyección</div>
              <div class="progress"><div class="progress-bar" style="width:${projPct}%"></div></div>
            </div>

            <div class="meta mt-2">
              <span class="badge badge-custom ${vorBadge}">VOR: ${p.vor ?? "-"}</span>
              <span class="badge badge-custom bg-primary">Adj VOR: ${p.adjustedVOR ?? "-"}</span>
              <span class="badge badge-custom bg-secondary">Drop: ${p.dropoff ?? "-"}</span>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderPagination(total) {
    const totalPages = Math.ceil(total / pageSize);
    if (totalPages <= 1) { pagination.innerHTML = ""; return; }

    let html = "";
    for (let i = 1; i <= totalPages; i++) {
      html += `<button class="${i === currentPage ? "active" : ""}" data-page="${i}">${i}</button>`;
    }
    pagination.innerHTML = html;

    pagination.querySelectorAll("button").forEach(btn => {
      btn.addEventListener("click", () => {
        currentPage = Number(btn.dataset.page);
        refreshUI();
      });
    });
  }

  function refreshUI() {
    const start = (currentPage - 1) * pageSize;
    const pagePlayers = filteredData.slice(start, start + pageSize);
    renderCards(pagePlayers);
    renderPagination(filteredData.length);
    saveFilters();
  }

  function applyFilters() {
    const status = statusSelect.value;
    const pos = positionSelect.value;
    const bye = Number(byeInput.value || 0);
    const q = searchInput.value.toLowerCase();

    filteredData = draftData.filter(p =>
      (status === "TODOS" || p.status === "LIBRE") &&
      (!pos || p.position === pos) &&
      (!bye || p.bye == bye) &&
      (!q || p.nombre.toLowerCase().includes(q))
    );

    currentPage = 1;
    refreshUI();
  }

  // =====================
  // Eventos
  // =====================
  searchInput.addEventListener("input", applyFilters);
  statusSelect.addEventListener("change", applyFilters);
  positionSelect.addEventListener("change", applyFilters);
  byeInput.addEventListener("input", applyFilters);
  leagueSelect.addEventListener("change", loadDraftData);
  expertSelect.addEventListener("change", loadDraftData);

  // =====================
  // Cargar datos
  // =====================
  async function loadDraftData() {
    try {
      const leagueId = leagueSelect.value;
      const idExpert = expertSelect.value;
      if (!leagueId || !idExpert) return showError("Selecciona liga y experto");

      showLoadingBar("Cargando", "Descargando jugadores...");
      const { players } = await fetchDraftData(leagueId, positionSelect.value, byeInput.value, idExpert, false);
      Swal.close();

      draftData = players;
      applyFilters();
    } catch (e) {
      Swal.close();
      console.error(e);
      showError("Error al cargar datos");
    }
  }

  await renderExpertSelect("#select-expert");
  await renderLeagueSelect("#select-league");
  loadFilters();

  // Si ya hay liga y experto guardados, carga los datos automáticamente
  if (leagueSelect.value && expertSelect.value) loadDraftData();
}
