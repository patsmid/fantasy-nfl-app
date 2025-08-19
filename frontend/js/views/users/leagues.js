import {
  fetchManualLeaguesByUser,
  insertManualLeague,
  deleteManualLeague,
  setLeagueUser
} from '../api.js';
import { showSuccess, showError } from '../../components/alerts.js';

export default async function () {
  const content = document.getElementById('content-container');
  content.innerHTML = `
    <div class="card border-0 shadow-sm rounded flock-card">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <h4 class="m-0 d-flex align-items-center gap-2">
            <i class="bi bi-pencil-square text-warning"></i> Ligas Manuales
          </h4>
          <button class="btn btn-sm btn-success d-flex align-items-center gap-2" id="btn-add-league" type="button">
            <i class="bi bi-plus-circle"></i> Nueva Liga
          </button>
        </div>

        <div class="table-responsive">
          <table id="manualLeaguesTable" class="table table-dark table-hover align-middle w-100">
            <thead class="table-dark text-uppercase text-secondary small">
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>League ID</th>
                <th>Usuario</th>
                <th>Dynasty</th>
                <th>BestBall</th>
                <th>Draft ID</th>
                <th>Rosters</th>
                <th>Status</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Modal para agregar liga -->
    <div class="modal fade" id="modalAddLeague" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content bg-dark text-white">
          <div class="modal-header border-secondary">
            <h5 class="modal-title">Agregar Liga Manual</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <form id="formAddLeague" class="row g-3">
              <div class="col-12">
                <label class="form-label">Nombre</label>
                <input type="text" class="form-control" name="name" required>
              </div>
              <div class="col-12">
                <label class="form-label">Usuario (UUID opcional)</label>
                <input type="text" class="form-control" name="user_id" placeholder="Opcional">
              </div>
              <div class="col-6">
                <label class="form-label">Draft ID</label>
                <input type="text" class="form-control" name="draft_id">
              </div>
              <div class="col-6">
                <label class="form-label">Rosters</label>
                <input type="number" class="form-control" name="total_rosters">
              </div>
              <div class="col-6">
                <label class="form-label">Dynasty</label>
                <select name="dynasty" class="form-select">
                  <option value="">--</option>
                  <option value="true">Sí</option>
                  <option value="false">No</option>
                </select>
              </div>
              <div class="col-6">
                <label class="form-label">BestBall</label>
                <select name="bestball" class="form-select">
                  <option value="">--</option>
                  <option value="true">Sí</option>
                  <option value="false">No</option>
                </select>
              </div>
              <div class="col-12">
                <label class="form-label">Status</label>
                <input type="text" class="form-control" name="status">
              </div>
            </form>
          </div>
          <div class="modal-footer border-secondary">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="submit" form="formAddLeague" class="btn btn-success">Guardar</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Modal
  const modalAdd = new bootstrap.Modal(document.getElementById('modalAddLeague'));

  // Botón agregar
  document.getElementById('btn-add-league').addEventListener('click', () => {
    document.getElementById('formAddLeague').reset();
    modalAdd.show();
  });

  // Submit agregar liga
  document.getElementById('formAddLeague').addEventListener('submit', async e => {
    e.preventDefault();
    const formData = Object.fromEntries(new FormData(e.target).entries());
    try {
      await insertManualLeague(formData);
      showSuccess('Liga agregada correctamente');
      modalAdd.hide();
      await loadManualLeagues();
    } catch (err) {
      showError('Error al insertar liga: ' + err.message);
    }
  });

  await loadManualLeagues();
}

async function loadManualLeagues() {
  const leagues = await fetchManualLeaguesByUser(); // puedes pasar un user_id si quieres filtrado
  const tbody = document.querySelector('#manualLeaguesTable tbody');

  // Ordenar por display_order ASC
  leagues.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));

  const rows = leagues.map(l => {
    const dynastyBadge = l.dynasty === true
      ? '<span class="badge bg-success">Sí</span>'
      : l.dynasty === false
        ? '<span class="badge bg-danger">No</span>'
        : '<span class="badge bg-secondary">--</span>';

    const bestBallBadge = l.bestball === true
      ? '<span class="badge bg-success">Sí</span>'
      : l.bestball === false
        ? '<span class="badge bg-danger">No</span>'
        : '<span class="badge bg-secondary">--</span>';

    const actions = `
      <button class="btn btn-sm btn-danger delete-league" data-id="${l.id}">
        <i class="bi bi-trash"></i>
      </button>
    `;

    return [
      `<div class="text-white text-center">${l.id}</div>`,
      `<span class="fw-semibold">${l.name}</span>`,
      `<span class="fw-semibold">${l.league_id}</span>`,
      `<div class="text-white text-center">${l.user_id || '-'}</div>`,
      `<div class="text-center">${dynastyBadge}</div>`,
      `<div class="text-center">${bestBallBadge}</div>`,
      `<div class="text-white text-center">${l.draft_id || ''}</div>`,
      `<div class="text-white text-center">${l.total_rosters || ''}</div>`,
      `<div class="text-center"><span class="badge bg-success text-uppercase">${l.status || ''}</span></div>`,
      actions
    ];
  });

  // Inicializa o reinicia DataTable
  if ($.fn.DataTable.isDataTable('#manualLeaguesTable')) {
    const table = $('#manualLeaguesTable').DataTable();
    table.clear().rows.add(rows).draw();
  } else {
    $('#manualLeaguesTable').DataTable({
      data: rows,
      responsive: true,
      paging: false,
      language: {
        url: '//cdn.datatables.net/plug-ins/2.3.2/i18n/es-MX.json'
      },
      dom: 'tip'
    });
  }

  // Listeners borrar
  setTimeout(() => {
    document.querySelectorAll('.delete-league').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (!confirm('¿Eliminar esta liga?')) return;
        try {
          await deleteManualLeague(id);
          showSuccess('Liga eliminada correctamente');
          await loadManualLeagues();
        } catch (err) {
          showError('Error al eliminar liga: ' + err.message);
        }
      });
    });
  }, 100);
}
