import { fetchPlayers, updatePlayers } from '../api.js';

export default async function renderPlayersView() {
  const container = document.getElementById('main-content');
  container.innerHTML = `
    <h2>Jugadores</h2>
    <div class="d-flex justify-content-between align-items-center mb-3">
      <div></div>
      <button id="update-btn" class="btn btn-primary">Actualizar jugadores</button>
    </div>
    <table id="players-table" class="display w-100">
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
  `;

  // Agrega inputs de filtro en cada columna del footer
  $('#players-table tfoot th').each(function () {
    const title = $(this).text();
    $(this).html(`<input type="text" class="form-control form-control-sm" placeholder="Filtrar ${title}" />`);
  });

  // Inicializa la DataTable
  const table = $('#players-table').DataTable({
    processing: true,
    serverSide: true,
    ajax: {
      url: '/player',
      dataSrc: 'data',
      data: function (d) {
        // Añade filtros de columna al request
        $('#players-table tfoot input').each(function (index) {
          const value = this.value;
          if (value) {
            d[`filter_col_${index}`] = value;
          }
        });
      },
    },
    columns: [
      { data: 'id' },
      { data: 'full_name' },
      { data: 'position' },
      { data: 'team' },
      { data: 'status' },
    ],
    pageLength: 10,
    lengthMenu: [10, 25, 50, 100],
    language: {
      url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json'
    }
  });

  // Aplica los filtros cuando el usuario los escriba
  $('#players-table tfoot input').on('keyup change', function () {
    table.ajax.reload();
  });

  // Botón de actualizar
  const updateBtn = document.getElementById('update-btn');
  updateBtn.addEventListener('click', async () => {
    updateBtn.disabled = true;
    updateBtn.textContent = 'Actualizando...';
    await updatePlayers();
    updateBtn.textContent = 'Actualizar jugadores';
    updateBtn.disabled = false;
    table.ajax.reload();
  });
}
