import { fetchConfig, updateConfig } from '../api.js';
import { showError, showLoadingBar, showSuccess } from '../../components/alerts.js';

export default async function () {
  const content = document.getElementById('content-container');
	content.innerHTML = '';
	content.insertAdjacentHTML('beforeend', `
	<div class="card border-0 shadow-sm rounded flock-card">
	  <div class="card-body">
	    <ul class="nav nav-tabs mb-3" id="configTabs" role="tablist">
	      <li class="nav-item" role="presentation">
	        <button class="nav-link active" id="config-tab" data-bs-toggle="tab" data-bs-target="#config-panel" type="button" role="tab">
	          <i class="bi bi-gear-fill me-1"></i> Configuración
	        </button>
	      </li>
	      <li class="nav-item" role="presentation">
	        <button class="nav-link" id="teams-tab" data-bs-toggle="tab" data-bs-target="#teams-panel" type="button" role="tab">
	          <i class="bi bi-people-fill me-1"></i> Equipos NFL
	        </button>
	      </li>
	    </ul>

	    <div class="tab-content" id="configTabsContent">
	      <!-- Configuración -->
	      <div class="tab-pane fade show active" id="config-panel" role="tabpanel">
	        <div class="d-flex justify-content-between align-items-center mb-3">
	          <h5 class="m-0 d-flex align-items-center gap-2">
	            <i class="bi bi-sliders2 text-warning"></i> Configuración
	          </h5>
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

	      <!-- Equipos -->
	      <div class="tab-pane fade" id="teams-panel" role="tabpanel">
	        <div class="d-flex justify-content-between align-items-center mb-3">
	          <h5 class="m-0 d-flex align-items-center gap-2">
	            <i class="bi bi-shield-fill text-warning"></i> Equipos NFL
	          </h5>
	          <button class="btn btn-sm btn-warning" id="btn-update-teams">
	            <i class="bi bi-arrow-repeat me-1"></i> Actualizar equipos
	          </button>
	        </div>
	        <div class="table-responsive">
	          <table id="teamsTable" class="table table-dark table-hover align-middle w-100">
	            <thead class="table-dark">
	              <tr>
	                <th>Equipo</th>
	                <th>Abreviación</th>
	                <th>Bye Week</th>
									<th></th>
	              </tr>
	            </thead>
	            <tbody></tbody>
	          </table>
	        </div>
	      </div>
	    </div>
	  </div>
	</div>

	<!-- Modal -->
	<div class="modal fade" id="configModal" tabindex="-1">
	  <div class="modal-dialog modal-dialog-centered modal-fullscreen-sm-down">
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

		<!-- Modal Editar Equipo -->
	<div class="modal fade" id="teamModal" tabindex="-1">
	  <div class="modal-dialog modal-dialog-centered modal-fullscreen-sm-down">
	    <form class="modal-content bg-dark text-white border border-secondary rounded" id="teamForm">
	      <div class="modal-header border-bottom border-secondary">
	        <h5 class="modal-title">Editar Equipo</h5>
	        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
	      </div>
	      <div class="modal-body">
	        <input type="hidden" id="teamId" />
	        <div class="mb-3">
	          <label for="teamName" class="form-label">Nombre del equipo</label>
	          <input type="text" class="form-control" id="teamName" required />
	        </div>
	        <div class="mb-3">
	          <label for="teamAbbr" class="form-label">Abreviación</label>
	          <input type="text" class="form-control" id="teamAbbr" required />
	        </div>
	        <div class="mb-3">
	          <label for="teamBye" class="form-label">Bye Week</label>
	          <input type="number" class="form-control" id="teamBye" min="1" max="14" required />
	        </div>
	      </div>
	      <div class="modal-footer border-top border-secondary">
	        <button type="submit" class="btn btn-success">Guardar</button>
	        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
	      </div>
	    </form>
	  </div>
	</div>
	`);

	// const modalEl = document.getElementById('configModal');
	// const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
	// modal.show()

	document.getElementById('btn-add-config').addEventListener('click', () => {
	  document.getElementById('configForm').reset();
	  document.getElementById('configId').value = '';
	  document.getElementById('configKey').readOnly = false;

	  const modalEl = document.getElementById('configModal');
	  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
	  modal.show();
	});


	document.getElementById('btn-update-teams').addEventListener('click', async () => {
		try {
			showLoadingBar('Actualizando equipos...');

			const res = await fetch('https://fantasy-nfl-backend.onrender.com/teams/save', {
				method: 'POST'
			});

			const json = await res.json();
			if (!res.ok) throw new Error(json.error || 'Error desconocido');

			showSuccess(`Equipos actualizados (${json.count})`);
		} catch (err) {
			showError('Error al actualizar equipos: ' + err.message);
		}
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

	document.getElementById('teamForm').addEventListener('submit', async (e) => {
	  e.preventDefault();
	  const id = document.getElementById('teamId').value;
	  const team = document.getElementById('teamName').value.trim();
	  const abbr = document.getElementById('teamAbbr').value.trim();
	  const bye = parseInt(document.getElementById('teamBye').value);

	  try {
			const res = await fetch(`https://fantasy-nfl-backend.onrender.com/teams/${id}`, {
			  method: 'PUT',
			  headers: { 'Content-Type': 'application/json' },
			  body: JSON.stringify({ team, abbr, bye })
			});

	    const json = await res.json();
	    if (!res.ok) throw new Error(json.error || 'Error al actualizar equipo');

	    bootstrap.Modal.getInstance(document.getElementById('teamModal')).hide();
	    await loadTeams();
	    showSuccess('Equipo actualizado');
	  } catch (err) {
	    showError('Error al guardar equipo: ' + err.message);
	  }
	});

  await loadConfig();
	await loadTeams();
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
        url: '//cdn.datatables.net/plug-ins/2.3.2/i18n/es-MX.json'
      },
      dom: 'tip'
    });
  } else {
    $('#configTable').DataTable().clear().destroy();
    $('#configTable').DataTable({
      responsive: true,
      pageLength: 10,
      language: {
        url: '//cdn.datatables.net/plug-ins/2.3.2/i18n/es-MX.json'
      },
      dom: 'tip'
    });
  }

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

async function loadTeams() {
  try {
    const res = await fetch('https://fantasy-nfl-backend.onrender.com/teams');
    const teams = await res.json();

    const tbody = document.querySelector('#teamsTable tbody');
    tbody.innerHTML = '';

		teams.forEach(team => {
		  const tr = document.createElement('tr');
		  tr.innerHTML = `
		    <td class="fw-semibold">${team.team}</td>
		    <td>${team.abbr}</td>
		    <td>${team.bye}</td>
		    <td>
		      <button class="btn btn-sm btn-outline-warning btn-edit-team"
		              data-id="${team.id}"
		              data-team="${team.team}"
		              data-abbr="${team.abbr}"
		              data-bye="${team.bye}">
		        <i class="bi bi-pencil-square"></i>
		      </button>
		    </td>
		  `;
		  tbody.appendChild(tr);
		});

    // Inicializa o reinicia DataTable
    if (!$.fn.DataTable.isDataTable('#teamsTable')) {
      $('#teamsTable').DataTable({
        responsive: true,
        pageLength: 10,
        language: {
          url: '//cdn.datatables.net/plug-ins/2.3.2/i18n/es-MX.json'
        },
        dom: 'tip'
      });
    } else {
      $('#teamsTable').DataTable().clear().destroy();
      $('#teamsTable').DataTable({
        responsive: true,
        pageLength: 10,
        language: {
          url: '//cdn.datatables.net/plug-ins/2.3.2/i18n/es-MX.json'
        },
        dom: 'tip'
      });
    }
  } catch (err) {
    showError('Error al cargar equipos: ' + err.message);
  }

	document.querySelectorAll('.btn-edit-team').forEach(btn => {
	  btn.addEventListener('click', () => {
	    document.getElementById('teamId').value = btn.dataset.id;
	    document.getElementById('teamName').value = btn.dataset.team;
	    document.getElementById('teamAbbr').value = btn.dataset.abbr;
	    document.getElementById('teamBye').value = btn.dataset.bye;

	    const teamModalEl = document.getElementById('teamModal');
	    const teamModal = bootstrap.Modal.getOrCreateInstance(teamModalEl);
	    teamModal.show();
	  });
	});
}
