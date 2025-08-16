import { fetchDraftData } from '../api.js';
import { positions } from '../../components/constants.js';
import { showError, showLoadingBar } from '../../components/alerts.js';
import { renderExpertSelect } from '../../components/selectExperts.js';
import { renderLeagueSelect } from '../../components/selectLeagues.js';

export default async function renderDraftView() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="draft-header d-flex justify-content-between align-items-center mb-3">
      <div>
        ${renderLeagueSelect()}
        ${renderExpertSelect()}
      </div>
      <div class="d-none d-md-block">
        <button id="toggleViewBtn" class="btn btn-outline-light btn-sm">Ver como Cards</button>
      </div>
    </div>
    <div class="mb-3">
      <input type="text" id="searchInput" class="form-control" placeholder="Buscar jugador...">
    </div>
    <div id="draftContent"></div>
    <div id="paginationControls" class="mt-3 d-flex justify-content-center"></div>
  `;

  let currentView = window.innerWidth < 768 ? 'cards' : 'table'; // móvil siempre cards
  let currentPage = 1;
  const pageSize = 12;
  let allPlayers = [];
  let filteredPlayers = [];
  let sortColumn = null;
  let sortAsc = true;

  async function loadData() {
    showLoadingBar('Cargando draft...');
    try {
      const leagueId = document.getElementById('leagueSelect').value;
      const expertId = document.getElementById('expertSelect').value;

      const data = await fetchDraftData({ leagueId, expertId });
      allPlayers = data || [];
      filteredPlayers = [...allPlayers];
      render();
    } catch (err) {
      showError('Error al cargar datos de draft');
    }
  }

  function applyFiltersAndSort() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    filteredPlayers = allPlayers.filter(p =>
      p.full_name.toLowerCase().includes(searchTerm) ||
      p.team?.toLowerCase().includes(searchTerm) ||
      p.position?.toLowerCase().includes(searchTerm)
    );

    if (sortColumn) {
      filteredPlayers.sort((a, b) => {
        if (a[sortColumn] < b[sortColumn]) return sortAsc ? -1 : 1;
        if (a[sortColumn] > b[sortColumn]) return sortAsc ? 1 : -1;
        return 0;
      });
    }
  }

  function render() {
    applyFiltersAndSort();

    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedPlayers = filteredPlayers.slice(startIndex, endIndex);

    if (currentView === 'table') {
      renderTable(paginatedPlayers);
    } else {
      renderCards(paginatedPlayers);
    }
    renderPagination();
  }

  function renderTable(players) {
    const draftContent = document.getElementById('draftContent');
    let html = `
      <table class="table table-dark table-hover table-sm">
        <thead>
          <tr>
            <th role="button" data-column="rank">#</th>
            <th role="button" data-column="full_name">Jugador</th>
            <th role="button" data-column="position">Pos</th>
            <th role="button" data-column="team">Equipo</th>
            <th role="button" data-column="adp_value">ADP</th>
            <th role="button" data-column="vor">VOR</th>
          </tr>
        </thead>
        <tbody>
          ${players.map((p, i) => `
            <tr>
              <td>${p.rank || startIndex + i + 1}</td>
              <td>${p.full_name}</td>
              <td>${p.position}</td>
              <td>${p.team || '-'}</td>
              <td>${p.adp_value ?? '-'}</td>
              <td>${p.vor?.toFixed(1) ?? '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    draftContent.innerHTML = html;

    draftContent.querySelectorAll('th[role="button"]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.getAttribute('data-column');
        if (sortColumn === col) {
          sortAsc = !sortAsc;
        } else {
          sortColumn = col;
          sortAsc = true;
        }
        render();
      });
    });
  }

  function renderCards(players) {
    const draftContent = document.getElementById('draftContent');
    let html = `<div class="row g-3">`;
    players.forEach(p => {
      html += `
        <div class="col-12 col-md-4 col-lg-3">
          <div class="card bg-dark text-light h-100">
            <div class="card-body">
              <h5 class="card-title">${p.full_name}</h5>
              <p class="card-text mb-1"><strong>Pos:</strong> ${p.position}</p>
              <p class="card-text mb-1"><strong>Equipo:</strong> ${p.team || '-'}</p>
              <p class="card-text mb-1"><strong>ADP:</strong> ${p.adp_value ?? '-'}</p>
              <p class="card-text"><strong>VOR:</strong> ${p.vor?.toFixed(1) ?? '-'}</p>
            </div>
          </div>
        </div>
      `;
    });
    html += `</div>`;
    draftContent.innerHTML = html;
  }

  function renderPagination() {
    const paginationControls = document.getElementById('paginationControls');
    const totalPages = Math.ceil(filteredPlayers.length / pageSize);

    let html = `<nav><ul class="pagination pagination-sm">`;
    for (let i = 1; i <= totalPages; i++) {
      html += `
        <li class="page-item ${i === currentPage ? 'active' : ''}">
          <a class="page-link" href="#">${i}</a>
        </li>
      `;
    }
    html += `</ul></nav>`;
    paginationControls.innerHTML = html;

    paginationControls.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', e => {
        e.preventDefault();
        currentPage = parseInt(a.textContent);
        render();
      });
    });
  }

  // Event listeners
  document.getElementById('searchInput').addEventListener('input', () => {
    currentPage = 1;
    render();
  });

  document.getElementById('toggleViewBtn')?.addEventListener('click', () => {
    currentView = currentView === 'table' ? 'cards' : 'table';
    document.getElementById('toggleViewBtn').textContent =
      currentView === 'table' ? 'Ver como Cards' : 'Ver como Tabla';
    render();
  });

  document.getElementById('leagueSelect').addEventListener('change', loadData);
  document.getElementById('expertSelect').addEventListener('change', loadData);

  loadData();
}
