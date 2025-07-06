import { fetchPlayers, updatePlayers } from '../api.js';

export default async function renderPlayersView() {
  const container = document.getElementById('content-container');
  container.innerHTML = `
    <div class="container mt-4">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h2 class="mb-0">Jugadores</h2>
        <button id="update-btn" class="btn btn-primary">
          <i class="fas fa-sync-alt"></i> Actualizar jugadores
        </button>
      </div>

      <div class="card p-3">
        <div class="table-responsive">
          <table id="players-table" class="table table-dark table-hover w-100">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Posición</th>
                <th>Equipo</th>
                <th>Status</th>
              </tr>
            </thead>
            <tfoot>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Posición</th>
                <th>Equipo</th>
                <th>Status</th>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  `;

  // Inputs de filtro para cada columna
  $('#players-table tfoot th').each(function () {
    const title = $(this).text();
    $(this).html(`<input type="text" class="form-control form-control-sm" placeholder="Filtrar ${title}" />`);
  });

  const table = $('#players-table').DataTable({
    processing: true,
    serverSide: true,
    ajax: {
      url: 'https://fantasy-nfl-backend.onrender.com/players',
      dataSrc: 'data',
      data: function (d) {
        $('#players-table tfoot input').each(function (index) {
          const value = this.value;
          if (value) {
            d[`filter_col_${index}`] = value;
          }
        });
      }
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
      url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json'
    },
    initComplete: function () {
      this.api().columns().every(function () {
        const column = this;
        $('input', column.footer()).on('keyup change', function () {
          column.search(this.value).draw();
        });
      });
    }
  });

  const updateBtn = document.getElementById('update-btn');
  updateBtn.addEventListener('click', async () => {
    updateBtn.disabled = true;
    updateBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Actualizando...';

    try {
      await updatePlayers();
      table.ajax.reload();
    } catch (error) {
      console.error('Error actualizando jugadores:', error);
    } finally {
      updateBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Actualizar jugadores';
      updateBtn.disabled = false;
    }
  });
}
