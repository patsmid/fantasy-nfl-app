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
            <thead class="table-dark text-uppercase text-secondary small">
              <tr>
                <th>ID</th>
                <th>ID Experto</th>
                <th>Nombre</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Modal -->
    <div class="modal fade" id="expertModal" tabindex="-1" aria-labelledby="expertModalLabel" aria-hidden="true">
      <div class="modal-dialog">
        <form class="modal-content bg-dark text-white border border-secondary rounded" id="expertForm">
          <div class="modal-header border-bottom border-secondary">
            <h5 class="modal-title" id="expertModalLabel">Agregar experto</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="modal-id">
            <div class="mb-3">
              <label for="modal-id-experto" class="form-label">ID Experto</label>
              <input type="number" class="form-control" id="modal-id-experto" required>
            </div>
            <div class="mb-3">
              <label for="modal-experto" class="form-label">Nombre</label>
              <input type="text" class="form-control" id="modal-experto" required>
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

  await loadExperts();

  const modalEl = document.getElementById('expertModal');
  const modal = new bootstrap.Modal(modalEl);

  document.getElementById('btn-add-expert').addEventListener('click', () => {
    document.getElementById('expertForm').reset();
    document.getElementById('modal-id').value = '';
    document.getElementById('expertModalLabel').textContent = 'Agregar experto';
    modal.show();
  });

  document.getElementById('expertForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('modal-id').value;
    const id_experto = document.getElementById('modal-id-experto').value;
    const experto = document.getElementById('modal-experto').value;

    try {
      if (id) {
        await updateExpert(id, { id_experto, experto });
      } else {
        await createExpert({ id_experto, experto });
      }
      modal.hide();
      await loadExperts();
    } catch (err) {
      alert('Error al guardar experto: ' + err.message);
    }
  });
}

async function loadExperts() {
  const experts = await fetchExperts();
  const tbody = document.querySelector('#expertsTable tbody');
  tbody.innerHTML = '';

  experts.forEach(e => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${e.id}</td>
      <td>${e.id_experto}</td>
      <td>${e.experto}</td>
      <td>
        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-outline-warning btn-edit" data-id="${e.id}" data-id_experto="${e.id_experto}" data-experto="${e.experto}" title="Editar">
            <i class="bi bi-pencil-square"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger btn-delete" data-id="${e.id}" title="Eliminar">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const modal = new bootstrap.Modal(document.getElementById('expertModal'));

  document.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('modal-id').value = btn.dataset.id;
      document.getElementById('modal-id-experto').value = btn.dataset.id_experto;
      document.getElementById('modal-experto').value = btn.dataset.experto;
      document.getElementById('expertModalLabel').textContent = 'Editar experto';
      const modalEl = document.getElementById('configModal');
      const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
      modal.show();
    });
  });

  document.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm('¿Estás seguro de eliminar este experto?')) {
        try {
          await deleteExpert(btn.dataset.id);
          await loadExperts();
        } catch (err) {
          alert('Error al eliminar experto: ' + err.message);
        }
      }
    });
  });

  // Re-inicializa la DataTable con estilo moderno
  window.expertsTable = new DataTable('#expertsTable', {
    destroy: true,
    responsive: true,
    perPage: 10,
    sortable: true,
    labels: {
      placeholder: 'Buscar expertos...',
      perPage: '{select} registros por página',
      noRows: 'No se encontraron expertos',
      info: 'Mostrando {start} a {end} de {rows} expertos'
    }
  });
}
