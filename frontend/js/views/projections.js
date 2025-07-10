import { showLoadingBar, showError } from '../../components/alerts.js';

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

    let url = `https://fantasy-nfl-backend.onrender.com/projections?season=${season}`;
    if (week) url += `&week=${week}`;

    const res = await fetch(url);
    const data = await res.json();
    renderProjectionsTable(data);
  });

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  document.getElementById('btn-update-projections').addEventListener('click', async () => {
    const btn = document.getElementById('btn-update-projections');
    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-hourglass-split me-1"></i> Actualizando...';

    showLoadingBar('Actualizando proyecciones', 'Procesando semanas por bloques...');

    const totalWeeks = 18;
    const chunkSize = 3;
    let totalWeekly = 0;
    let totalTotal = 0;

    for (let fromWeek = 1; fromWeek <= totalWeeks; fromWeek += chunkSize) {
      const toWeek = Math.min(fromWeek + chunkSize - 1, totalWeeks);
      try {
        const res = await fetch('https://fantasy-nfl-backend.onrender.com/projections/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fromWeek, toWeek })
        });

        const json = await res.json();
        if (!json.success) throw new Error(json.error);

        totalWeekly += json.weeklyCount;
        totalTotal += json.totalCount;

        console.log(`✅ Semanas ${fromWeek}-${toWeek} actualizadas`);
      } catch (err) {
        console.error(`❌ Error en semanas ${fromWeek}-${toWeek}:`, err.message);
        Swal.close();
        showError(`❌ Error al actualizar semanas ${fromWeek}-${toWeek}:\n` + err.message);
        break;
      }

      await sleep(5000);
    }

    Swal.close();
    alert(`✅ Proyecciones completas\nTotal semanal: ${totalWeekly}\nTotal acumulado: ${totalTotal}`);

    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-arrow-repeat me-1"></i> Actualizar';
  });
}

function renderProjectionsTable(data = []) {
  const keys = ['pts_ppr', 'pts_half_ppr', 'pts_std'];
  const html = `
    <table id="projectionsTable" class="table table-dark table-hover align-middle w-100">
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

  if ($.fn.dataTable.isDataTable('#projectionsTable')) {
    $('#projectionsTable').DataTable().destroy();
  }

  $('#projectionsTable').DataTable({
    responsive: true,
    pageLength: 25,
    language: {
      url: '//cdn.datatables.net/plug-ins/2.3.2/i18n/es-MX.json'
    },
    dom: '<"row mb-2"<"col-sm-6"l><"col-sm-6"f>>tip'
  });
}
