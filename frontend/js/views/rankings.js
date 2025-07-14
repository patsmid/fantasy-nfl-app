import { fetchExperts } from '../api.js';
import { showError, showLoadingBar } from '../../components/alerts.js';

export default async function renderRankingsView() {
  const content = document.getElementById('content-container');

  const experts = await fetchExperts();
  const expertOptions = experts
    .filter(e => e.source === 'flock')
    .map(e => `<option value="${e.id_experto}">${e.experto}</option>`)
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
      const res = await fetch(`/rankings/flock?dynasty=${dynasty}&superflex=${superflex}&expert=${expert}`);
      const result = await res.json();
      Swal.close();

      if (!Array.isArray(result)) throw new Error('Respuesta inválida');

      const tbody = document.querySelector('#rankingsTable tbody');
      tbody.innerHTML = '';

      result.forEach(p => {
        tbody.innerHTML += `
          <tr>
            <td>${p.player_name}</td>
            <td>${p.position}</td>
            <td>${p.team}</td>
            <td>${p.average_rank}</td>
          </tr>
        `;
      });
    } catch (err) {
      showError('Error al obtener rankings: ' + err.message);
    }
  });
}
