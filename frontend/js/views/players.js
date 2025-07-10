import { fetchPlayers, updatePlayers } from '../api.js';

export default async function renderPlayersView() {
  const container = document.getElementById('content-container');
  container.innerHTML = `
    <div class="card border-0 shadow-sm rounded flock-card">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <h4 class="m-0 d-flex align-items-center gap-2">
            <i class="bi bi-person-lines-fill text-success"></i> Jugadores
          </h4>
          <button id="update-btn" class="btn btn-sm btn-primary d-flex align-items-center gap-2">
            <i class="bi bi-arrow-repeat"></i> Actualizar jugadores
          </button>
        </div>

        <div class="table-responsive">
          <table id="players-table" class="table table-dark table-hover align-middle w-100">
            <thead class="table-dark text-uppercase text-secondary small">
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Posición</th>
                <th>Equipo</th>
                <th>Status</th>
              </tr>
            </thead>
          </table>
        </div>
      </div>
    </div>
  `;

  const table = $('#players-table').DataTable({
    processing: true,
    serverSide: true,
    ajax: {
      url: 'https://fantasy-nfl-backend.onrender.com/players',
      dataSrc: 'data'
    },
    columns: [
      { data: 'id' },
      { data: 'full_name' },
      { data: 'position' },
      { data: 'team' },
      { data: 'status' }
    ],
    responsive: true,
    pageLength: 10,
    lengthMenu: [10, 25, 50, 100],
    language: {
      url: '//cdn.datatables.net/plug-ins/2.3.2/i18n/es-MX.json'
    }
  });

  const updateBtn = document.getElementById('update-btn');
  updateBtn.addEventListener('click', async () => {
    updateBtn.disabled = true;
    updateBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Actualizando...`;

    try {
      await updatePlayers();
      table.ajax.reload();
    } catch (error) {
      alert('Error al actualizar jugadores: ' + error.message);
    } finally {
      updateBtn.innerHTML = `<i class="bi bi-arrow-repeat"></i> Actualizar jugadores`;
      updateBtn.disabled = false;
    }
  });
}
