import { fetchExperts, createExpert, updateExpert, deleteExpert } from '../api.js';

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

  // Mostrar/ocultar campo ID Experto según fuente
  sourceSelect.addEventListener('change', () => {
    if (sourceSelect.value === 'flock') {
      idExpertoGroup.style.display = 'none';
    } else {
      idExpertoGroup.style.display = '';
    }
  });

  document.getElementById('btn-add-expert').addEventListener('click', () => {
    document.getElementById('expertForm').reset();
    document.getElementById('modal-id').value = '';
    idExpertoGroup.style.display = ''; // mostrar por default
    document.getElementById('modal-source').value = '';
    document.getElementById('expertModalLabel').textContent = 'Agregar experto';
    modal.show();
  });

  document.getElementById('expertForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('modal-id').value;
    const id_experto = document.getElementById('modal-id-experto').value;
    const experto = document.getElementById('modal-experto').value;
    const source = document.getElementById('modal-source').value;

    try {
      if (id) {
        await updateExpert(id, { id_experto, experto, source });
      } else {
        await createExpert({ id_experto, experto, source });
      }
      modal.hide();
      await loadExperts(modal);
    } catch (err) {
      alert('Error al guardar experto: ' + err.message);
    }
  });

  await loadExperts(modal);
}

async function loadExperts(modal) {
  const experts = await fetchExperts();
  const tbody = document.querySelector('#expertsTable tbody');
  tbody.innerHTML = '';

  experts.forEach(e => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${e.source === 'flock' ? e.experto : e.id_experto || ''}</td>
      <td>${e.experto}</td>
      <td><span class="badge bg-secondary">${e.source || '–'}</span></td>
      <td>
        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-outline-warning btn-edit"
            data-id="${e.id}"
            data-id_experto="${e.id_experto || ''}"
            data-experto="${e.experto}"
            data-source="${e.source || ''}"
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

      // Mostrar u ocultar el campo ID Experto al editar
      const idExpertoGroup = document.getElementById('id-experto-group');
      if (btn.dataset.source === 'flock') {
        idExpertoGroup.style.display = 'none';
      } else {
        idExpertoGroup.style.display = '';
      }

      document.getElementById('expertModalLabel').textContent = 'Editar experto';

      const modalEl = document.getElementById('expertModal');
      const modalInstance = bootstrap.Modal.getOrCreateInstance(modalEl);
      modalInstance.show();
    });
  });

  document.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm('¿Estás seguro de eliminar este experto?')) {
        try {
          await deleteExpert(btn.dataset.id);
          await loadExperts(modal);
        } catch (err) {
          alert('Error al eliminar experto: ' + err.message);
        }
      }
    });
  });
}
