import { fetchPlayersMeta } from '../api.js'; // este endpoint devuelve playersMetaMap

export default async function renderPlayersView() {
  const content = document.getElementById('content-container');
  content.innerHTML = `
    <div class="container-fluid">
      <!-- Barra de filtros -->
      <div class="row mb-3">
        <div class="col-md-4 mb-2">
          <input type="text" id="playerSearch" class="form-control" placeholder="Buscar jugador...">
        </div>
        <div class="col-md-3 mb-2">
          <select id="positionFilter" class="form-select">
            <option value="">Todas las posiciones</option>
            <option value="QB">QB</option>
            <option value="RB">RB</option>
            <option value="WR">WR</option>
            <option value="TE">TE</option>
            <option value="K">K</option>
            <option value="DEF">DEF</option>
          </select>
        </div>
        <div class="col-md-3 mb-2">
          <select id="leagueFilter" class="form-select">
            <option value="">Todas las ligas</option>
          </select>
        </div>
      </div>

      <!-- Grid de jugadores -->
      <div id="playersGrid" class="row row-cols-1 row-cols-md-2 row-cols-lg-3 g-3"></div>
    </div>
  `;

  // Fetch inicial
	const players = await fetchPlayersMeta();
console.log(players);
  // Rellenar ligas para el filtro
  const leagueSet = new Set();
  players.forEach(p => {
    (p.leagues || []).forEach(l => leagueSet.add(l.name));
  });
  const leagueFilter = document.getElementById('leagueFilter');
  [...leagueSet].sort().forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    leagueFilter.appendChild(opt);
  });

  // Render grid
  function renderGrid() {
    const search = document.getElementById('playerSearch').value.toLowerCase();
    const pos = document.getElementById('positionFilter').value;
    const league = document.getElementById('leagueFilter').value;

    const grid = document.getElementById('playersGrid');
    grid.innerHTML = '';

    players
      .filter(p => {
        const matchesSearch = p.full_name?.toLowerCase().includes(search);
        const matchesPos = pos ? p.position === pos : true;
        const matchesLeague = league ? p.leagues?.some(l => l.name === league) : true;
        return matchesSearch && matchesPos && matchesLeague;
      })
      .forEach(p => {
        const leaguesHTML = (p.leagues || [])
          .map(l => `<span class="badge bg-dark">${l.name}</span>`)
          .join(' ');

        const card = document.createElement('div');
        card.className = 'col';
        card.innerHTML = `
          <div class="waiver-card h-100">
            <div class="d-flex justify-content-between align-items-center">
              <div>
                <h5 class="waiver-name">${p.full_name || 'Jugador desconocido'}</h5>
                <small class="waiver-pos">${p.team || ''} • ${p.position || ''}</small>
              </div>
              <div class="waiver-rank">#${p.rank ?? '-'}</div>
            </div>

            <div class="waiver-body mt-2">
              ${p.injuryStatus ? `<span class="badge bg-danger">${p.injuryStatus}</span>` : ''}
              ${p.byeWeek ? `<span class="badge bg-secondary">Bye ${p.byeWeek}</span>` : ''}
              ${p.ownershipPct ? `<span class="waiver-score">Own ${p.ownershipPct}%</span>` : ''}
              ${p.adp ? `<span class="badge bg-info text-dark">ADP ${p.adp}</span>` : ''}
            </div>

            <div class="mt-2">
              ${leaguesHTML || '<small class="text-muted">Ninguna liga</small>'}
            </div>
          </div>
        `;
        grid.appendChild(card);
      });
  }

  // Eventos
  document.getElementById('playerSearch').addEventListener('input', renderGrid);
  document.getElementById('positionFilter').addEventListener('change', renderGrid);
  document.getElementById('leagueFilter').addEventListener('change', renderGrid);

  // Primer render
  renderGrid();
}
