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
    const expert = document.getElementById('ranking-expert').value;
    const dynasty = document.getElementById('ranking-dynasty').value === 'true';
    const superflex = document.getElementById('ranking-superflex').value === 'true';

    try {
      showLoadingBar('Consultando rankings...');
      const res = await fetch(`https://fantasy-nfl-backend.onrender.com/rankings/flock?dynasty=${dynasty}&superflex=${superflex}&expert=${expert}`);
      const result = await res.json();
      const data = result.data;
      Swal.close();

      if (!Array.isArray(data)) throw new Error('Respuesta inválida');

      const tbody = document.querySelector('#rankingsTable tbody');
      tbody.innerHTML = '';

      data.forEach(p => {
        const rankValue = expert ? p.rank : p.average_rank;

        tbody.innerHTML += `
          <tr>
            <td>${rankValue}</td>
            <td>${p.player_name}</td>
            <td>${p.position}</td>
            <td>${p.team}</td>
            <td>${p.average_rank}</td>
          </tr>
        `;
      });

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
        // dom: 'tip'
      });

    } catch (err) {
      showError('Error al obtener rankings: ' + err.message);
    }
  });
}
