// src/views/players-breakdown.js
import { fetchPlayersMeta } from '../api.js';
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
          <div class="col-sm-6 col-md-3">
            <input type="text" id="playerSearch" class="form-control" placeholder="Buscar jugador...">
          </div>

          <div class="col-sm-6 col-md-2">
            <select id="positionFilter" class="form-select">
              <option value="">Todas las posiciones</option>
              <option value="QB">QB</option>
              <option value="RB">RB</option>
              <option value="WR">WR</option>
              <option value="TE">TE</option>
              <option value="K">K</option>
              <option value="DEF">DST</option>
            </select>
          </div>

          <div class="col-sm-6 col-md-2">
            <select id="injuryFilter" class="form-select">
              <option value="">Todas las lesiones</option>
              <option value="IR">IR</option>
              <option value="PUP">PUP</option>
              <option value="OUT">OUT</option>
              <option value="SUS">SUS</option>
							<option value="NA">NA</option>
            </select>
          </div>

          <div class="col-sm-6 col-md-2">
            <select id="leagueFilter" class="form-select">
              <option value="">Todas las ligas</option>
            </select>
          </div>

          <div class="col-sm-12 col-md-3 d-flex align-items-center justify-content-end gap-1">
            <label class="small mb-0" for="sortSelect">Ordenar por:</label>
            <select id="sortSelect" class="form-select form-select-sm">
              <option value="leagues_count_desc" selected>Rostered ↓</option>
              <option value="leagues_count_asc">Rostered ↑</option>
              <option value="bye_week_asc">Bye week ↑</option>
              <option value="bye_week_desc">Bye week ↓</option>
              <option value="team_asc">Equipo ↑</option>
              <option value="team_desc">Equipo ↓</option>
              <option value="position_asc">Posición ↑</option>
              <option value="position_desc">Posición ↓</option>
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
  const injSelect = document.getElementById('injuryFilter');
  const leagueSelect = document.getElementById('leagueFilter');
  const sortSelect = document.getElementById('sortSelect');
  const loaderEl = document.getElementById('playersLoader');
  const gridEl = document.getElementById('playersGrid');
  const countEl = document.getElementById('playersCount');

  let players = [];
  let filteredPlayers = [];
  let totalLeagues = 0;

  async function loadPlayers() {
    try {
      loaderEl.style.display = '';
      gridEl.style.display = 'none';
      countEl.textContent = '';

      showLoadingBar('Cargando jugadores', 'Consultando información...');

      const res = await fetchPlayersMeta();
      if (typeof Swal !== 'undefined') Swal.close();

      totalLeagues = res?.leagues?.length || 0;

      players = (Array.isArray(res) ? res : (res?.players || []))
        .map(p => {
          const ownership_pct = totalLeagues ? Math.round((p.leagues_count / totalLeagues) * 100) : 0;
          return {
            player_id: p.player_id ?? p.id ?? null,
            name: p.name ?? p.full_name ?? p.nombre ?? null,
            position: (p.position ?? p.pos ?? '').toUpperCase() || null,
            team: p.team ?? null,
            bye_week: p.bye_week ?? null,
            injury_status: p.injury_status ?? null,
            total_count: p.total_count ?? (p.occurrences ? p.occurrences.length : 0),
            leagues_count: p.leagues_count ?? (p.occurrences ? new Set((p.occurrences||[]).map(o => o.league_id)).size : 0),
            ownership_pct,
            occurrences: p.occurrences || [],
            raw: p
          };
        });

      // poblar filtro de ligas
      const leagueSet = new Map();
      (res?.leagues || []).forEach(l => {
        leagueSet.set(l.league_id, l.name);
      });

      leagueSelect.innerHTML = '<option value="">Todas las ligas</option>';
      [...leagueSet.entries()]
        .sort((a,b) => a[1].localeCompare(b[1]))
        .forEach(([id, name]) => {
          const opt = document.createElement('option');
          opt.value = id;
          opt.textContent = name;
          leagueSelect.appendChild(opt);
        });

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
    loaderEl.style.display = 'none';
    gridEl.style.display = '';

    const search = (searchInput.value || '').trim().toLowerCase();
    const pos = posSelect.value;
    const leagueId = leagueSelect.value;
    const injury = injSelect.value;
    const sortVal = sortSelect.value;

    const items = players.filter(p => {
      const name = (p.name || '').toLowerCase();
      const matchesSearch = !search || name.includes(search) || (p.team || '').toLowerCase().includes(search);
      const matchesPos = !pos || (p.position === pos);
      const matchesLeague = !leagueId || (p.occurrences || []).some(o => (o.league_id ?? o.leagueId) === leagueId);
      const matchesInjury = !injury || (p.injury_status ?? '').toUpperCase() === injury;
      return matchesSearch && matchesPos && matchesLeague && matchesInjury;
    });

    filteredPlayers = items;

    // ordenamiento
    filteredPlayers.sort((a,b) => {
      switch(sortVal) {
        case 'leagues_count_desc': return b.leagues_count - a.leagues_count;
        case 'leagues_count_asc': return a.leagues_count - b.leagues_count;
        case 'bye_week_asc': return (a.bye_week || 99) - (b.bye_week || 99);
        case 'bye_week_desc': return (b.bye_week || 0) - (a.bye_week || 0);
        case 'team_asc': return (a.team||'').localeCompare(b.team||'');
        case 'team_desc': return (b.team||'').localeCompare(a.team||'');
        case 'position_asc': return (a.position||'').localeCompare(b.position||'');
        case 'position_desc': return (b.position||'').localeCompare(a.position||'');
        default: return 0;
      }
    });

    countEl.textContent = `${filteredPlayers.length} jugadores`;

    gridEl.innerHTML = '';
    if (!filteredPlayers.length) {
      gridEl.innerHTML = `
        <div class="col-12">
          <div class="card text-center" style="background:transparent; border:none;">
            <div class="card-body text-secondary py-4">No se encontraron jugadores con esos filtros.</div>
          </div>
        </div>
      `;
      return;
    }

    filteredPlayers.forEach(p => {
      const displayName = p.name || 'Jugador desconocido';

      const leaguesHTML = (p.occurrences || [])
        .map(o => {
          const lname = o.league_name ?? 'Liga';
          const role = (o.role || '').toLowerCase();
          let roleClass = 'bg-secondary';
          if (role === 'starter') roleClass = 'bg-success';
          else if (role === 'bench') roleClass = 'bg-dark';
          else if (role === 'reserve') roleClass = 'bg-warning text-dark';
          else if (role === 'taxi') roleClass = 'bg-info text-dark';

          return `<span class="badge ${roleClass} me-1 mb-1" title="${lname}">${lname} • ${o.role}</span>`;
        })
        .join(' ');

      const bye = p.bye_week;
      const inj = p.injury_status;

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
              <div class="waiver-rank mb-1">${p.ownership_pct}%</div>
              <div class="small text-secondary">${p.leagues_count} ligas</div>
            </div>
          </div>

          <div class="waiver-body mt-3">
            ${inj ? `<span class="badge bg-danger me-1">${inj}</span>` : ''}
            ${bye ? `<span class="badge bg-secondary me-1">Bye ${bye}</span>` : ''}
          </div>

          <div class="mt-3">
            ${leaguesHTML}
          </div>
        </div>
      `;
      gridEl.appendChild(col);
    });
  }

  const debouncedRender = debounce(renderGrid, 180);
  searchInput.addEventListener('input', debouncedRender);
  posSelect.addEventListener('change', renderGrid);
  injSelect.addEventListener('change', renderGrid);
  leagueSelect.addEventListener('change', renderGrid);
  sortSelect.addEventListener('change', renderGrid);
  btnRefresh.addEventListener('click', async () => {
    await loadPlayers();
  });

  await loadPlayers();
}
