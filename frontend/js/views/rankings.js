import { fetchExperts } from '../api.js';
import { showError, showLoadingBar } from '../../components/alerts.js';

export default async function renderRankingsView() {
  const content = document.getElementById('content-container');

  const experts = await fetchExperts();
  const expertOptions = experts
    .sort((a, b) => (a.display_order ?? 9999) - (b.display_order ?? 9999))
    .map(e => {
      const value = e.source === 'flock' ? e.experto : e.id_experto;
      const label = `${e.experto} (${e.source || 'otro'})`;
      return `<option value="${value}">${label}</option>`;
    })
    .join('');

  content.innerHTML = `
    <div class="card border-0 shadow-sm rounded flock-card">
      <div class="card-body">
        <h4 class="mb-4 d-flex align-items-center gap-2">
          <i class="bi bi-stars text-warning"></i> Rankings
        </h4>

        <form id="rankingsForm" class="row g-3 mb-4">
          <div class="col-md-4">
            <label class="form-label">Experto</label>
            <select class="form-select" id="ranking-expert">
              <option value="">Todos</option>
              ${expertOptions}
            </select>
          </div>

          <div class="col-md-3">
            <label class="form-label">Formato</label>
            <select class="form-select" id="ranking-superflex">
              <option value="false">1QB</option>
              <option value="true">SuperFlex</option>
            </select>
          </div>

          <div class="col-md-3">
            <label class="form-label">Tipo de liga</label>
            <select class="form-select" id="ranking-dynasty">
              <option value="false">Redraft</option>
              <option value="true">Dynasty</option>
            </select>
          </div>

          <div class="col-md-2 d-flex align-items-end">
            <button type="submit" class="btn btn-primary w-100">Consultar</button>
          </div>
        </form>

        <div class="table-responsive">
          <table id="rankingsTable" class="table table-dark table-striped align-middle w-100">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Jugador</th>
                <th>Posición</th>
                <th>Equipo</th>
                <th>Ranking promedio</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  document.getElementById('rankingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const expertId = document.getElementById('ranking-expert').value;
    const dynasty = document.getElementById('ranking-dynasty').value === 'true';
    const superflex = document.getElementById('ranking-superflex').value === 'true';

    try {
      showLoadingBar('Consultando rankings...');

      // Identificar el experto seleccionado
      const selectedExpert = experts.find(e =>
        (e.source === 'flock' ? e.experto : e.id_experto) == expertId
      );
      const source = selectedExpert?.source || 'flock';

      // Construir URL según source y tipo de identificador
      let queryUrl;
      switch (source) {
        case 'flock':
          // Flock espera el nombre del experto
          queryUrl = `https://fantasy-nfl-backend.onrender.com/rankings/flock?dynasty=${dynasty}&superflex=${superflex}&expert=${encodeURIComponent(selectedExpert.experto)}`;
          break;
        case 'fantasypros':
          // FantasyPros espera idExpert
          queryUrl = `https://fantasy-nfl-backend.onrender.com/rankings/fantasypros?season=2025&scoring=PPR&idExpert=${selectedExpert.id_experto}`;
          break;
        case 'manual':
          // Manual espera expert_id
          queryUrl = `https://fantasy-nfl-backend.onrender.com/rankings/manual?expert_id=${selectedExpert.id_experto}`;
          break;
        default:
          queryUrl = `https://fantasy-nfl-backend.onrender.com/rankings/flock?dynasty=${dynasty}&superflex=${superflex}`;
      }

      const res = await fetch(queryUrl);
      const result = await res.json();
      console.log('💡 Resultado del fetch:', result); // para depuración
      Swal.close();

      // Manejo flexible de la respuesta
      let players = [];
      if (result.players) {
        players = result.players;
      } else if (Array.isArray(result.data)) {
        players = result.data;
      } else if (Array.isArray(result)) {
        players = result;
      } else {
        console.error('💥 Resultado inesperado:', result);
        throw new Error('Formato de respuesta inesperado');
      }

      // Limpiar tabla
      const tbody = document.querySelector('#rankingsTable tbody');
      tbody.innerHTML = '';

      // Llenar tabla
      players.forEach(p => {
        const rankValue = p.rank ?? p.average_rank ?? '-';
        const playerName = p.full_name || p.player_name || '-';
        const position = p.position || '-';
        const team = p.team || '-';
        const avgRank = p.average_rank ?? '-';

        tbody.innerHTML += `
          <tr>
            <td>${rankValue}</td>
            <td>${playerName}</td>
            <td>${position}</td>
            <td>${team}</td>
            <td>${avgRank}</td>
          </tr>
        `;
      });

      // Inicializar DataTable
      if ($.fn.DataTable.isDataTable('#rankingsTable')) {
        $('#rankingsTable').DataTable().clear().destroy();
      }

      $('#rankingsTable').DataTable({
        responsive: true,
        pageLength: 25,
        order: [[0, 'asc']],
        language: {
          url: '//cdn.datatables.net/plug-ins/2.3.2/i18n/es-MX.json'
        },
      });

    } catch (err) {
      showError('Error al obtener rankings: ' + err.message);
    }
  });

}
