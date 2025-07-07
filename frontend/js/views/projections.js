export default async function renderProjectionsView() {
  const content = document.getElementById('content-container');
  content.innerHTML = `
    <div class="card border-0 shadow-sm rounded flock-card">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <h4 class="m-0 d-flex align-items-center gap-2">
            <i class="bi bi-graph-up text-success"></i> Proyecciones
          </h4>
          <button class="btn btn-sm btn-outline-primary" id="btn-update-projections">
            <i class="bi bi-arrow-repeat me-1"></i> Actualizar
          </button>
        </div>

        <div class="row g-2 mb-3">
          <div class="col-sm-4">
            <label for="seasonInput" class="form-label">Temporada</label>
            <input type="number" id="seasonInput" class="form-control" value="2025" />
          </div>
          <div class="col-sm-4">
            <label for="weekInput" class="form-label">Semana (opcional)</label>
            <input type="number" id="weekInput" class="form-control" placeholder="1-18" min="1" max="18" />
          </div>
          <div class="col-sm-4 d-flex align-items-end">
            <button class="btn btn-dark w-100" id="btn-load-projections">
              <i class="bi bi-search"></i> Buscar
            </button>
          </div>
        </div>

        <div id="projectionsResult" class="table-responsive"></div>
      </div>
    </div>
  `;

  document.getElementById('btn-load-projections').addEventListener('click', async () => {
    const season = document.getElementById('seasonInput').value.trim();
    const week = document.getElementById('weekInput').value.trim();

    let url = `/api/projections?season=${season}`;
    if (week) url += `&week=${week}`;

    const res = await fetch(url);
    const data = await res.json();
    renderProjectionsTable(data);
  });

  document.getElementById('btn-update-projections').addEventListener('click', async () => {
    const btn = document.getElementById('btn-update-projections');
    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-hourglass-split me-1"></i> Actualizando...';

    try {
      const res = await fetch('/api/projections/update', { method: 'POST' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      alert(`✅ Proyecciones actualizadas.\nTotales: ${json.totalCount}\nSemanales: ${json.weeklyCount}`);
    } catch (err) {
      alert('❌ Error al actualizar proyecciones:\n' + err.message);
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-arrow-repeat me-1"></i> Actualizar';
  });
}

function renderProjectionsTable(data = []) {
  const keys = ['pts_ppr', 'pts_half_ppr', 'pts_std'];
  const html = `
    <table class="table table-dark table-hover align-middle w-100">
      <thead>
        <tr>
          <th>Jugador</th>
          ${keys.map(k => `<th>${k}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${data.map(row => `
          <tr>
            <td class="fw-semibold">${row.player_id}</td>
            ${keys.map(k => `<td>${(row.stats?.[k] || 0).toFixed(2)}</td>`).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  document.getElementById('projectionsResult').innerHTML = html;
}
