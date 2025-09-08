// src/views/players-breakdown.js
import { fetchPlayersMeta } from '../api.js'; // devuelve array de players
import { showError, showLoadingBar } from '../../components/alerts.js';

function debounce(fn, wait = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

export default async function renderPlayersView() {
  const content = document.getElementById('content-container');

  content.innerHTML = `
    <div class="card border-0 shadow-sm rounded flock-card">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h4 class="m-0 d-flex align-items-center gap-2">
            <i class="bi bi-people-fill text-success"></i> Jugadores en mis ligas
          </h4>
          <div>
            <button class="btn btn-sm btn-primary" id="btn-refresh-players">
              <i class="bi bi-arrow-clockwise"></i> Actualizar
            </button>
          </div>
        </div>

        <!-- filtros -->
        <div class="row g-2 align-items-center mb-3">
          <div class="col-sm-6 col-md-4">
            <input type="text" id="playerSearch" class="form-control" placeholder="Buscar jugador...">
          </div>

          <div class="col-sm-6 col-md-3">
            <select id="positionFilter" class="form-select">
              <option value="">Todas las posiciones</option>
              <option value="QB">QB</option>
              <option value="RB">RB</option>
              <option value="WR">WR</option>
              <option value="TE">TE</option>
              <option value="K">K</option>
              <option value="DST">DST</option>
            </select>
          </div>

          <div class="col-sm-12 col-md-3">
            <select id="leagueFilter" class="form-select">
              <option value="">Todas las ligas</option>
            </select>
          </div>

          <div class="col-sm-12 col-md-2 text-end">
            <small id="playersCount" class="text-secondary"></small>
          </div>
        </div>

        <!-- contenedor de carga / grid -->
        <div id="playersLoader" class="text-center py-5">
          <div class="spinner-border" role="status" style="width:3rem; height:3rem;">
            <span class="visually-hidden">Loading...</span>
          </div>
          <div class="mt-2 text-secondary">Cargando jugadores...</div>
        </div>

        <div id="playersGrid" class="row row-cols-1 row-cols-md-2 row-cols-lg-3 g-3" style="display:none;"></div>

      </div>
    </div>
  `;

  const btnRefresh = document.getElementById('btn-refresh-players');
  const searchInput = document.getElementById('playerSearch');
  const posSelect = document.getElementById('positionFilter');
  const leagueSelect = document.getElementById('leagueFilter');
  const loaderEl = document.getElementById('playersLoader');
  const gridEl = document.getElementById('playersGrid');
  const countEl = document.getElementById('playersCount');

  let players = []; // array con todos los jugadores
  let filteredPlayers = [];

  async function loadPlayers() {
    try {
      // mostrar loader visual + modal (si quieres)
      loaderEl.style.display = '';
      gridEl.style.display = 'none';
      countEl.textContent = '';

      showLoadingBar('Cargando jugadores', 'Consultando backend...');

      // fetch
      const res = await fetchPlayersMeta(); // devuelve array de jugadores
      // cerrar modal de carga
      if (typeof Swal !== 'undefined') Swal.close();

      // normalizar: backend devuelve 'name' en muchos casos; mapear a campos usados en UI
      players = (Array.isArray(res) ? res : (res?.players || []))
        .map(p => ({
          player_id: p.player_id ?? p.id ?? null,
          name: p.name ?? p.full_name ?? p.nombre ?? null,
          position: (p.position ?? p.pos ?? '').toUpperCase() || null,
          team: p.team ?? null,
          total_count: p.total_count ?? (p.occurrences ? p.occurrences.length : 0),
          leagues_count: p.leagues_count ?? (p.occurrences ? new Set((p.occurrences||[]).map(o => o.league_id)).size : 0),
          occurrences: p.occurrences || p.leagues || [],
          raw: p
        }));

      // construir filtro de ligas basado en occurrences (nombre)
      const leagueSet = new Map(); // id -> name
      players.forEach(p => {
        (p.occurrences || []).forEach(o => {
          const lid = o.league_id ?? o.leagueId ?? o.league;
          const lname = o.league_name ?? o.leagueName ?? o.name ?? o.league_name;
          if (lid && lname) leagueSet.set(lid, lname);
        });
      });

      // poblar select de ligas
      leagueSelect.innerHTML = '<option value="">Todas las ligas</option>';
      [...leagueSet.entries()]
        .sort((a,b) => a[1].localeCompare(b[1]))
        .forEach(([id, name]) => {
          const opt = document.createElement('option');
          opt.value = id; // usar id para filtro exacto
          opt.textContent = name;
          leagueSelect.appendChild(opt);
        });

      // primer render
      filteredPlayers = players.slice();
      renderGrid();

    } catch (err) {
      if (typeof Swal !== 'undefined') Swal.close();
      loaderEl.style.display = 'none';
      gridEl.style.display = 'none';
      showError('Error al cargar jugadores: ' + (err?.message || err));
      console.error('fetchPlayersMeta error', err);
    }
  }

  function renderGrid() {
    // ocultar loader
    loaderEl.style.display = 'none';
    gridEl.style.display = '';

    const search = (searchInput.value || '').trim().toLowerCase();
    const pos = posSelect.value;
    const leagueId = leagueSelect.value;

    const items = players.filter(p => {
      // name fallback and matching
      const name = (p.name || '').toLowerCase();
      const matchesSearch = !search || name.includes(search) || (p.team || '').toLowerCase().includes(search);
      const matchesPos = !pos || (p.position === pos);
      const matchesLeague = !leagueId || (p.occurrences || []).some(o => (o.league_id ?? o.leagueId) === leagueId);
      return matchesSearch && matchesPos && matchesLeague;
    });

    filteredPlayers = items;

    // actualizar contador
    countEl.textContent = `${items.length} jugadores`;

    // vaciar grid
    gridEl.innerHTML = '';

    if (!items.length) {
      gridEl.innerHTML = `
        <div class="col-12">
          <div class="card text-center" style="background:transparent; border:none;">
            <div class="card-body text-secondary py-4">No se encontraron jugadores con esos filtros.</div>
          </div>
        </div>
      `;
      return;
    }

    // render cards
    items.forEach(p => {
      const displayName = p.name || 'Jugador desconocido';
      // construir badges de ligas (usamos league_name si existe)
      const leaguesHTML = (p.occurrences || [])
        .map(o => {
          const lname = o.league_name ?? o.leagueName ?? o.name ?? 'Liga';
          // small badge with tooltip (title)
          return `<span class="badge bg-dark me-1 mb-1" title="${lname}">${lname}</span>`;
        })
        .join(' ');

      // extra info (intentar leer de raw si existe)
      const bye = p.raw?.bye_week ?? p.raw?.byeWeek ?? null;
      const inj = p.raw?.injury_status ?? p.raw?.injuryStatus ?? p.raw?.status ?? null;
      const adp = p.raw?.adp ?? p.raw?.ADP ?? null;
      const own = p.raw?.ownershipPct ?? p.raw?.ownership_pct ?? p.raw?.ownership ?? null;
      const rank = p.raw?.rank ?? p.raw?.pos_rank ?? null;

      const col = document.createElement('div');
      col.className = 'col';
      col.innerHTML = `
        <div class="waiver-card h-100">
          <div class="d-flex justify-content-between align-items-start">
            <div>
              <h5 class="waiver-name mb-1">${displayName}</h5>
              <div class="small text-secondary">${p.team || ''} • ${p.position || ''}</div>
            </div>
            <div class="text-end">
              <div class="waiver-rank mb-1">#${rank ?? '-'}</div>
              <div class="small text-secondary">${p.leagues_count} ligas</div>
            </div>
          </div>

          <div class="waiver-body mt-3">
            ${inj ? `<span class="badge bg-danger me-1">${inj}</span>` : ''}
            ${bye ? `<span class="badge bg-secondary me-1">Bye ${bye}</span>` : ''}
            ${own ? `<span class="waiver-score me-1">Own ${own}%</span>` : ''}
            ${adp ? `<span class="badge bg-info text-dark">ADP ${adp}</span>` : ''}
          </div>

          <div class="mt-3">
            ${leaguesHTML}
          </div>
        </div>
      `;
      gridEl.appendChild(col);
    });
  }

  // eventos con debounce en búsqueda
  const debouncedRender = debounce(renderGrid, 180);
  searchInput.addEventListener('input', debouncedRender);
  posSelect.addEventListener('change', renderGrid);
  leagueSelect.addEventListener('change', renderGrid);
  btnRefresh.addEventListener('click', async () => {
    await loadPlayers();
  });

  // carga inicial
  await loadPlayers();
}
