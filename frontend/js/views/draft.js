import { fetchDraftData } from '../api.js';
import { positions } from '../../components/constants.js';
import { showError, showLoadingBar } from '../../components/alerts.js';
import { renderExpertSelect } from '../../components/selectExperts.js';
import { renderLeagueSelect } from '../../components/selectLeagues.js';

export default async function renderDraftView() {
  const content = document.getElementById("content-container");

  content.innerHTML = `
  <style>
    /* estilos iguales que tu versión */
  </style>

  <div class="card border-0 shadow-sm rounded">
    <div class="card-body">
      <h4 class="mb-3 d-flex align-items-center gap-2">
        <i class="bi bi-clipboard-data text-info"></i> Draft Inteligente
        <button id="btn-refresh" class="btn btn-sm btn-info ms-auto">Actualizar</button>
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
            <option value="">TODAS</option>
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
  let currentPage = Number(localStorage.getItem("draftPage") || 1);
  const pageSize = 12;

  const cardsContainer = document.getElementById("draft-cards");
  const pagination = document.getElementById("pagination");
  const searchInput = document.getElementById("search-input");
  const statusSelect = document.getElementById("select-status");
  const positionSelect = document.getElementById("select-position");
  const leagueSelect = document.getElementById("select-league");
  const expertSelect = document.getElementById("select-expert");
  const byeInput = document.getElementById("input-bye");
  const btnRefresh = document.getElementById("btn-refresh");

  // =====================
  // Funciones
  // =====================
  function renderCards(players) {
    if (!players.length) {
      cardsContainer.innerHTML = `<div class="text-muted text-center">Sin jugadores</div>`;
      pagination.innerHTML = "";
      return;
    }

    const maxProj = Math.max(...players.map(x => Number(x.projection)||0)) || 1;

    cardsContainer.innerHTML = players.map(p => {
      const projPct = Math.min(100, (Number(p.projection||0)/maxProj)*100);
      const dropClass = p.dropoff && p.dropoff > 0 ? "badge-drop" : "badge-vor";
      return `
        <div class="col-12 col-md-6 col-lg-4">
          <div class="draft-card">
            <div class="title">
              <span>${p.nombre}</span>
              <span class="badge badge-rank">#${p.rank ?? "-"}</span>
            </div>
            <div class="meta">
              <span>${p.position}</span>
              <span>${p.team}</span>
              <span>Bye ${p.bye}</span>
              <span>ADP ${p.adpValue ?? "-"}</span>
            </div>
            <div>
              <div class="small">Proyección</div>
              <div class="progress"><div class="progress-bar" style="width:${projPct}%"></div></div>
            </div>
            <div class="meta mt-2">
              <span class="badge ${dropClass}">VOR: ${p.vor ?? "-"}</span>
              <span class="badge badge-vor">Adj: ${p.adjustedVOR ?? "-"}</span>
              <span class="badge badge-drop">Drop: ${p.dropoff ?? "-"}</span>
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
      html += `<button class="${i===currentPage?"active":""}" data-page="${i}">${i}</button>`;
    }
    pagination.innerHTML = html;

    pagination.querySelectorAll("button").forEach(btn => {
      btn.addEventListener("click", () => {
        currentPage = Number(btn.dataset.page);
        localStorage.setItem("draftPage", currentPage);
        refreshUI();
      });
    });
  }

  function refreshUI() {
    const start = (currentPage-1)*pageSize;
    const pagePlayers = filteredData.slice(start, start+pageSize);
    renderCards(pagePlayers);
    renderPagination(filteredData.length);
  }

  function applyFilters() {
    const status = statusSelect.value;
    const pos = positionSelect.value;
    const bye = Number(byeInput.value || 0);
    const q = searchInput.value.toLowerCase();

    filteredData = draftData.filter(p =>
      (status==="TODOS" || p.status==="LIBRE") &&
      (!pos || p.position===pos) &&
      (!bye || p.bye==bye) &&
      (!q || p.nombre.toLowerCase().includes(q))
    );

    currentPage = 1;
    refreshUI();
  }

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
      applyFilters(); // filtra automáticamente
    } catch (e) {
      Swal.close();
      console.error(e);
      showError("Error al cargar datos");
    }
  }

  // =====================
  // Inicialización
  // =====================
  await renderExpertSelect("#select-expert", { closeOnSelect: false });
  await renderLeagueSelect("#select-league", { closeOnSelect: false });

  // Eventos de cambio
  leagueSelect.addEventListener("change", loadDraftData);
  expertSelect.addEventListener("change", loadDraftData);

  // Botón actualizar
  btnRefresh.addEventListener("click", loadDraftData);

  // Restaurar filtros del localStorage
  if(localStorage.getItem("draftSearch")) searchInput.value = localStorage.getItem("draftSearch");
  if(localStorage.getItem("draftStatus")) statusSelect.value = localStorage.getItem("draftStatus");
  if(localStorage.getItem("draftPosition")) positionSelect.value = localStorage.getItem("draftPosition");
  if(localStorage.getItem("draftBye")) byeInput.value = localStorage.getItem("draftBye");

  // Guardar filtros en localStorage
  [searchInput, statusSelect, positionSelect, byeInput].forEach(el => {
    el.addEventListener("input", ()=> {
      localStorage.setItem("draftSearch", searchInput.value);
      localStorage.setItem("draftStatus", statusSelect.value);
      localStorage.setItem("draftPosition", positionSelect.value);
      localStorage.setItem("draftBye", byeInput.value);
    });
  });

  // Cargar datos iniciales si ya hay liga y experto seleccionados
  if (leagueSelect.value && expertSelect.value) loadDraftData();
}
