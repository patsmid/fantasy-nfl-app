import { fetchExperts, createExpert, updateExpert, deleteExpert } from '../api.js';
import { showSuccess, showError, showConfirm, showLoadingBar } from '../../components/alerts.js';

export default async function renderExpertsView() {
  const content = document.getElementById('content-container');
  content.innerHTML = `
    <div class="card border-0 shadow-sm rounded flock-card">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <h4 class="m-0 d-flex align-items-center gap-2">
            <i class="bi bi-person-badge text-warning"></i> Expertos
          </h4>
          <button class="btn btn-sm btn-primary d-flex align-items-center gap-2" id="btn-add-expert">
            <i class="bi bi-plus-circle"></i> Agregar experto
          </button>
        </div>

        <div class="table-responsive">
          <table id="expertsTable" class="table table-dark table-hover align-middle w-100">
            <thead class="table-dark">
              <tr>
                <th>ID Experto</th>
                <th>Nombre</th>
                <th>Fuente</th>
                <th>Orden</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Modal -->
    <div class="modal fade" id="expertModal" tabindex="-1">
      <div class="modal-dialog">
        <form class="modal-content bg-dark text-white border border-secondary rounded" id="expertForm">
          <div class="modal-header border-bottom border-secondary">
            <h5 class="modal-title" id="expertModalLabel">Agregar experto</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="modal-id">

            <div class="mb-3" id="id-experto-group">
              <label for="modal-id-experto" class="form-label">ID Experto</label>
              <input type="number" class="form-control" id="modal-id-experto">
            </div>

            <div class="mb-3">
              <label for="modal-experto" class="form-label">Nombre</label>
              <input type="text" class="form-control" id="modal-experto" required>
            </div>

            <div class="mb-3">
              <label for="modal-source" class="form-label">Fuente</label>
              <select class="form-select" id="modal-source" required>
                <option value="" disabled selected>Selecciona fuente...</option>
                <option value="fantasypros">FantasyPros</option>
                <option value="flock">Flock Fantasy</option>
              </select>
            </div>

            <div class="mb-3">
              <label for="modal-display-order" class="form-label">Orden</label>
              <input type="number" class="form-control" id="modal-display-order">
            </div>
          </div>
          <div class="modal-footer border-top border-secondary">
            <button type="submit" class="btn btn-success">Guardar</button>
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const modalEl = document.getElementById('expertModal');
  const modal = new bootstrap.Modal(modalEl);
  const sourceSelect = document.getElementById('modal-source');
  const idExpertoGroup = document.getElementById('id-experto-group');

  sourceSelect.addEventListener('change', () => {
    idExpertoGroup.style.display = sourceSelect.value === 'flock' ? 'none' : '';
  });

  document.getElementById('btn-add-expert').addEventListener('click', () => {
    document.getElementById('expertForm').reset();
    document.getElementById('modal-id').value = '';
    idExpertoGroup.style.display = '';
    document.getElementById('modal-source').value = '';
    document.getElementById('modal-display-order').value = '';
    document.getElementById('expertModalLabel').textContent = 'Agregar experto';
    modal.show();
  });

  document.getElementById('expertForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('modal-id').value;
    const id_experto = document.getElementById('modal-id-experto').value || null;
    const experto = document.getElementById('modal-experto').value;
    const source = document.getElementById('modal-source').value;
    const display_order = parseInt(document.getElementById('modal-display-order').value) || null;

    try {
      const payload = { id_experto, experto, source, display_order };
      if (id) {
        await updateExpert(id, payload);
        showSuccess('Experto actualizado correctamente');
      } else {
        await createExpert(payload);
        showSuccess('Experto creado correctamente');
      }
      modal.hide();
      await loadExperts();
    } catch (err) {
      showError(err.message);
    }
  });

  await loadExperts();
}

async function loadExperts() {
  try {
    showLoadingBar('Cargando expertos...');
    const experts = await fetchExperts();
    Swal.close();

    const tbody = document.querySelector('#expertsTable tbody');
    tbody.innerHTML = '';

    // Ordenar por display_order (nulls al final)
    experts.sort((a, b) => {
      if (a.display_order === null) return 1;
      if (b.display_order === null) return -1;
      return a.display_order - b.display_order;
    });

    experts.forEach(e => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${e.source === 'flock' ? e.experto : e.id_experto || ''}</td>
        <td>${e.experto}</td>
        <td><span class="badge bg-secondary">${e.source || '–'}</span></td>
        <td>${e.display_order ?? ''}</td>
        <td>
          <div class="d-flex gap-2">
            <button class="btn btn-sm btn-outline-warning btn-edit"
              data-id="${e.id}"
              data-id_experto="${e.id_experto || ''}"
              data-experto="${e.experto}"
              data-source="${e.source || ''}"
              data-display_order="${e.display_order ?? ''}"
              title="Editar">
              <i class="bi bi-pencil-square"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger btn-delete"
              data-id="${e.id}"
              title="Eliminar">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

    if ($.fn.DataTable.isDataTable('#expertsTable')) {
      $('#expertsTable').DataTable().clear().destroy();
    }

    $('#expertsTable').DataTable({
      responsive: true,
      pageLength: 10,
      language: {
        url: '//cdn.datatables.net/plug-ins/2.3.2/i18n/es-MX.json'
      },
      dom: 'tip'
    });

    document.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('modal-id').value = btn.dataset.id;
        document.getElementById('modal-id-experto').value = btn.dataset.id_experto;
        document.getElementById('modal-experto').value = btn.dataset.experto;
        document.getElementById('modal-source').value = btn.dataset.source || '';
        document.getElementById('modal-display-order').value = btn.dataset.display_order || '';
        idExpertoGroup.style.display = btn.dataset.source === 'flock' ? 'none' : '';
        document.getElementById('expertModalLabel').textContent = 'Editar experto';
        const modalInstance = bootstrap.Modal.getOrCreateInstance(document.getElementById('expertModal'));
        modalInstance.show();
      });
    });

    document.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const result = await showConfirm({ text: 'Esta acción no se puede deshacer.' });
        if (result.isConfirmed) {
          try {
            await deleteExpert(btn.dataset.id);
            showSuccess('Experto eliminado');
            await loadExperts();
          } catch (err) {
            showError(err.message);
          }
        }
      });
    });
  } catch (err) {
    showError('Error al cargar expertos: ' + err.message);
  }
}
