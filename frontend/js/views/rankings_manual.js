import { fetchExperts } from '../api.js';
import { showSuccess, showError, showLoadingBar } from '../../components/alerts.js';

export default async function renderManualRankingsView() {
  const content = document.getElementById('content-container');

  const experts = await fetchExperts();
  const manualExperts = experts.filter(e => e.source === 'manual');

  const expertOptions = manualExperts
    .map(e => `<option value="${e.id}">${e.experto}</option>`)
    .join('');

  content.innerHTML = `
    <div class="card border-0 shadow-sm rounded flock-card">
      <div class="card-body">
        <h4 class="mb-4"><i class="bi bi-pencil-square text-warning"></i> Rankings manuales</h4>
        <div class="mb-3">
          <label class="form-label">Experto</label>
          <select class="form-select" id="manual-expert">
            <option value="">Selecciona experto...</option>
            ${expertOptions}
          </select>
        </div>
        <div class="table-responsive">
          <table id="manualRankingsTable" class="table table-dark table-striped align-middle w-100">
            <thead>
              <tr>
                <th>Jugador</th>
                <th>Posición</th>
                <th>Equipo</th>
                <th>Rank</th>
                <th>Tier</th>
                <th>Guardar</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  document.getElementById('manual-expert').addEventListener('change', async (e) => {
    const expertId = e.target.value;
    if (!expertId) return;

    try {
      showLoadingBar('Cargando rankings...');
      const res = await fetch(`https://fantasy-nfl-backend.onrender.com/rankings/manual?expert_id=${expertId}`);
      const result = await res.json();
      Swal.close();

      const tbody = document.querySelector('#manualRankingsTable tbody');
      tbody.innerHTML = '';

      result.players.forEach(p => {
        tbody.innerHTML += `
          <tr>
            <td>${p.full_name}</td>
            <td>${p.position}</td>
            <td>${p.team}</td>
            <td><input type="number" class="form-control form-control-sm bg-dark text-white" value="${p.rank || ''}" data-id="${p.id}" data-field="rank"></td>
            <td><input type="number" class="form-control form-control-sm bg-dark text-white" value="${p.tier || ''}" data-id="${p.id}" data-field="tier"></td>
            <td><button class="btn btn-sm btn-success btn-save" data-id="${p.id}"><i class="bi bi-save"></i></button></td>
          </tr>
        `;
      });

      document.querySelectorAll('.btn-save').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          const rank = document.querySelector(`input[data-id="${id}"][data-field="rank"]`).value;
          const tier = document.querySelector(`input[data-id="${id}"][data-field="tier"]`).value;
          try {
            await fetch(`https://fantasy-nfl-backend.onrender.com/rankings/manual/${id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ rank: parseInt(rank), tier: parseInt(tier) })
            });
            showSuccess('Ranking actualizado');
          } catch (err) {
            showError('Error al actualizar: ' + err.message);
          }
        });
      });
    } catch (err) {
      showError('Error al cargar rankings: ' + err.message);
    }
  });
}
