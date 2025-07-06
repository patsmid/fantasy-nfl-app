import { fetchConfig, updateConfig } from '../api.js';

export default async function () {
  const content = document.getElementById('content-container');
  content.innerHTML = `
    <div class="card border-0 shadow-sm rounded flock-card">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <h4 class="m-0 d-flex align-items-center gap-2">
            <i class="bi bi-gear-fill text-warning"></i> Configuración
          </h4>
          <button class="btn btn-sm btn-primary" id="btn-add-config">
            <i class="bi bi-plus-circle me-1"></i> Agregar
          </button>
        </div>

        <div class="table-responsive">
          <table id="configTable" class="table table-dark table-hover align-middle w-100">
            <thead class="table-dark">
              <tr>
                <th>Clave</th>
                <th>Valor</th>
                <th>Última actualización</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Modal -->
    <div class="modal fade" id="configModal" tabindex="-1">
      <div class="modal-dialog">
        <form class="modal-content bg-dark text-white border border-secondary rounded" id="configForm">
          <div class="modal-header border-bottom border-secondary">
            <h5 class="modal-title">Configuración</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="configId" />
            <div class="mb-3">
              <label for="configKey" class="form-label">Clave</label>
              <input type="text" class="form-control" id="configKey" name="key" required />
            </div>
            <div class="mb-3">
              <label for="configValue" class="form-label">Valor</label>
              <input type="text" class="form-control" id="configValue" name="value" />
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

  const modalEl = document.getElementById('configModal');
  const modal = new bootstrap.Modal(modalEl);

  document.getElementById('btn-add-config').addEventListener('click', () => {
    document.getElementById('configForm').reset();
    document.getElementById('configId').value = '';
    document.getElementById('configKey').readOnly = false;
    modal.show();
  });

  document.getElementById('configForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('configId').value;
    const key = document.getElementById('configKey').value.trim();
    const value = document.getElementById('configValue').value.trim();

    try {
      if (id) {
        await updateConfig(id, value);
      } else {
        const res = await fetch('https://fantasy-nfl-backend.onrender.com/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value })
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
      }

      modal.hide();
      loadConfig();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });

  await loadConfig();
}

async function loadConfig() {
  const res = await fetch('https://fantasy-nfl-backend.onrender.com/config');
  const json = await res.json();
  const tbody = document.querySelector('#configTable tbody');
  tbody.innerHTML = '';

  json.data.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="fw-semibold">${row.key}</td>
      <td>${row.value || ''}</td>
      <td><small class="text-secondary">${new Date(row.updated_at).toLocaleString()}</small></td>
      <td>
        <button class="btn btn-sm btn-outline-warning btn-edit"
                data-id="${row.id}"
                data-key="${row.key}"
                data-value="${row.value}">
          <i class="bi bi-pencil-square"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Inicializa o reinicia DataTable
  if (!$.fn.DataTable.isDataTable('#configTable')) {
    $('#configTable').DataTable({
      responsive: true,
      pageLength: 10,
      language: {
        url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json'
      },
      dom: 'tip'
    });
  } else {
    $('#configTable').DataTable().clear().destroy();
    $('#configTable').DataTable({
      responsive: true,
      pageLength: 10,
      language: {
        url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json'
      },
      dom: 'tip'
    });
  }

  // 🔄 Aquí sí agregamos el evento a los botones que ya existen
  document.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('configId').value = btn.dataset.id;
      document.getElementById('configKey').value = btn.dataset.key;
      document.getElementById('configKey').readOnly = true;
      document.getElementById('configValue').value = btn.dataset.value || '';
      const modalEl = document.getElementById('configModal');
      const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
      modal.show();
    });
  });
}
