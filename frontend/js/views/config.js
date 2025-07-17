import { showSuccess, showError, showConfirm } from '../../components/alerts.js';

export default async function renderExtrasView() {
  const content = document.getElementById('content-container');
  content.innerHTML = `
    <div class="row g-4">
      <!-- Configuración -->
      <div class="col-12 col-lg-6">
        <div class="card">
          <div class="card-header d-flex justify-content-between align-items-center">
            <h5 class="mb-0">Configuración</h5>
            <button class="btn btn-sm btn-success" id="btn-refresh-config">Refrescar</button>
          </div>
          <div class="table-responsive">
            <table class="table table-sm table-bordered mb-0" id="table-config">
              <thead class="table-light">
                <tr>
                  <th>Clave</th>
                  <th>Valor</th>
                  <th>Última Modificación</th>
                  <th></th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Equipos NFL -->
      <div class="col-12 col-lg-6">
        <div class="card">
          <div class="card-header d-flex justify-content-between align-items-center">
            <h5 class="mb-0">Equipos NFL</h5>
            <button class="btn btn-sm btn-primary" id="btn-refresh-teams">Actualizar</button>
          </div>
          <div class="table-responsive">
            <table class="table table-sm table-bordered mb-0" id="table-teams">
              <thead class="table-light">
                <tr>
                  <th>Equipo</th>
                  <th>Abrev</th>
                  <th>Bye</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal de edición -->
    <div class="modal fade" id="modal-edit-config" tabindex="-1" aria-labelledby="modalLabel" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <form id="form-edit-config" class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="modalLabel">Editar Configuración</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="edit-id" />
            <div class="mb-3">
              <label for="edit-key" class="form-label">Clave</label>
              <input type="text" class="form-control" id="edit-key" readonly />
            </div>
            <div class="mb-3">
              <label for="edit-value" class="form-label">Valor</label>
              <input type="text" class="form-control" id="edit-value" required />
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

  await loadConfig();
  await loadTeams();

  document.getElementById('btn-refresh-config').addEventListener('click', loadConfig);
  document.getElementById('btn-refresh-teams').addEventListener('click', loadTeams);

  // Editar configuración
  document.querySelector('#table-config tbody').addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-edit');
    if (!btn) return;

    document.getElementById('edit-id').value = btn.dataset.id;
    document.getElementById('edit-key').value = btn.dataset.key;
    document.getElementById('edit-value').value = btn.dataset.value;
    new bootstrap.Modal(document.getElementById('modal-edit-config')).show();
  });

  // Guardar cambios
  document.getElementById('form-edit-config').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-id').value;
    const value = document.getElementById('edit-value').value;

    try {
      const res = await fetch('/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, value })
      });

      if (!res.ok) throw new Error('Error al guardar');
      showSuccess('Configuración actualizada');
      bootstrap.Modal.getInstance(document.getElementById('modal-edit-config')).hide();
      await loadConfig();
    } catch (err) {
      showError('No se pudo guardar: ' + err.message);
    }
  });
}

// =========================
// FUNCIONES AUXILIARES
// =========================

async function loadConfig() {
  const tbody = document.querySelector('#table-config tbody');
  tbody.innerHTML = `<tr><td colspan="4">Cargando...</td></tr>`;

  try {
    const res = await fetch('/config');
    const data = await res.json();

    tbody.innerHTML = '';
    data.forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="fw-semibold">${row.key}</td>
        <td>${row.value || ''}</td>
        <td><small class="text-secondary">${new Date(row.updated_at).toLocaleString()}</small></td>
        <td>
          <button class="btn btn-sm btn-outline-warning btn-edit"
                  data-id="${row.id}"
                  data-key="${row.key}"
                  data-value='${(row.value || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;')}'>
            <i class="bi bi-pencil-square"></i>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4">Error al cargar</td></tr>`;
    showError('Error al cargar configuración');
  }
}

async function loadTeams() {
  const tbody = document.querySelector('#table-teams tbody');
  tbody.innerHTML = `<tr><td colspan="3">Cargando...</td></tr>`;

  try {
    const res = await fetch('/teams');
    const data = await res.json();

    tbody.innerHTML = '';
    data.forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${row.team}</td>
        <td>${row.abbr}</td>
        <td>${row.bye_week}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="3">Error al cargar</td></tr>`;
    showError('Error al cargar equipos');
  }
}
