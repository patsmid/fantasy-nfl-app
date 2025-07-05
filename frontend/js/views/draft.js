import { fetchExperts, createExpert, updateExpert, deleteExpert } from '../api.js';

export default async function renderExpertsView() {
  const content = document.getElementById('content-container');
  content.innerHTML = `
    <div class="container mt-4">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h2>Expertos</h2>
        <button class="btn btn-primary" id="btn-add-expert">
          <i class="fas fa-plus"></i> Agregar experto
        </button>
      </div>

      <table id="expertsTable" class="table table-bordered table-hover w-100">
        <thead class="table-light">
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

    <!-- Modal -->
    <div class="modal fade" id="expertModal" tabindex="-1" aria-labelledby="expertModalLabel" aria-hidden="true">
      <div class="modal-dialog">
        <form class="modal-content" id="expertForm">
          <div class="modal-header">
            <h5 class="modal-title" id="expertModalLabel">Agregar experto</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
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
          <div class="modal-footer">
            <button type="submit" class="btn btn-success">Guardar</button>
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  `;

  await loadExperts();

  document.getElementById('btn-add-expert').addEventListener('click', () => {
    document.getElementById('expertForm').reset();
    document.getElementById('modal-id').value = '';
    document.getElementById('expertModalLabel').textContent = 'Agregar experto';
    new bootstrap.Modal(document.getElementById('expertModal')).show();
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
      bootstrap.Modal.getInstance(document.getElementById('expertModal')).hide();
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
        <button class="btn btn-sm btn-warning btn-edit" data-id="${e.id}" data-id_experto="${e.id_experto}" data-experto="${e.experto}">
          <i class="bi bi-pencil-square"></i>
        </button>
        <button class="btn btn-sm btn-danger btn-delete" data-id="${e.id}">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('modal-id').value = btn.dataset.id;
      document.getElementById('modal-id-experto').value = btn.dataset.id_experto;
      document.getElementById('modal-experto').value = btn.dataset.experto;
      document.getElementById('expertModalLabel').textContent = 'Editar experto';
      new bootstrap.Modal(document.getElementById('expertModal')).show();
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

  // Re-inicializa la DataTable
  window.expertsTable = new DataTable('#expertsTable', {
    destroy: true,
    responsive: true,
    perPage: 10,
    labels: {
      placeholder: 'Buscar...',
      perPage: '{select} registros por página',
      noRows: 'No se encontraron expertos',
      info: 'Mostrando {start} a {end} de {rows} expertos'
    }
  });
}
