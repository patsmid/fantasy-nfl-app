import { fetchUniqueSleeperADPValues, updateSleeperADP } from '../api.js';

export default async function renderADPView() {
  const container = document.getElementById('content-container');
  container.innerHTML = `
    <div class="card border-0 shadow-sm rounded flock-card">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <h4 class="m-0 d-flex align-items-center gap-2">
            <i class="bi bi-graph-up-arrow text-info"></i> ADP Sleeper
          </h4>
          <button id="update-adp-btn" class="btn btn-sm btn-primary d-flex align-items-center gap-2">
            <i class="bi bi-arrow-repeat"></i> Actualizar ADP
          </button>
        </div>

        <div class="table-responsive">
          <table id="adp-table" class="table table-dark table-hover align-middle w-100">
            <thead class="table-dark text-uppercase text-secondary small">
              <tr>
                <th>ID</th>
                <th>Tipo ADP</th>
                <th>Player ID</th>
                <th>Valor ADP</th>
                <th>Valor Prev</th>
                <th>Fecha</th>
                <th>Nombre</th>
                <th>Posición</th>
                <th>Equipo</th>
              </tr>
            </thead>
            <tfoot class="bg-dark text-white">
              <tr>
                <th></th> <!-- ID -->
                <th></th> <!-- Tipo ADP -->
                <th></th> <!-- Player ID -->
                <th></th> <!-- Valor ADP -->
                <th></th> <!-- Valor Prev -->
                <th></th> <!-- Fecha -->
                <th></th> <!-- Nombre -->
                <th></th> <!-- Posición -->
                <th></th> <!-- Equipo -->
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  `;

  const table = $('#adp-table').DataTable({
    processing: true,
    serverSide: true,
    ajax: {
      url: `https://fantasy-nfl-backend.onrender.com/sleeperADP`,
      dataSrc: 'data',
      data: function (d) {
        $('#adp-table tfoot select').each(function (index) {
          const val = this.value;
          if (val && val !== '') {
            d[`filter_col_${index}`] = val;
          }
        });
      }
    },
    columns: [
      { data: 'id' },
      { data: 'adp_type' },
      { data: 'sleeper_player_id' },
      { data: 'adp_value' },
      { data: 'adp_value_prev' },
      { data: 'date' },
      { data: 'full_name' },
      { data: 'position' },
      { data: 'team' }
    ],
    order: [[3, 'asc']],
    pageLength: 10,
    lengthMenu: [10, 25, 50, 100],
    responsive: true,
    language: {
      url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json'
    },
    initComplete: function () {
      const api = this.api();
      const selectCols = [
        { index: 1, column: 'adp_type' },
        { index: 5, column: 'date' },
        { index: 6, column: 'full_name' },
        { index: 7, column: 'position' },
        { index: 8, column: 'team' }
      ];

      selectCols.forEach(async ({ index, column }) => {
        const columnDT = api.column(index);
        const select = $('<select class="form-select form-select-sm bg-dark text-white border-secondary"><option value="">Todos</option></select>')
          .appendTo($(columnDT.footer()).empty())
          .on('change', function () {
            api.ajax.reload();
          });

        const options = await fetchUniqueSleeperADPValues(column);
        options.forEach(opt => {
          select.append(`<option value="${opt}">${opt}</option>`);
        });
      });
    }
  });

  // Botón actualizar
  const updateBtn = document.getElementById('update-adp-btn');
  updateBtn.addEventListener('click', async () => {
    updateBtn.disabled = true;
    updateBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Actualizando...`;
    try {
      await updateSleeperADP();
      table.ajax.reload();
    } catch (err) {
      alert('Error al actualizar: ' + err.message);
    } finally {
      updateBtn.innerHTML = `<i class="bi bi-arrow-repeat"></i> Actualizar ADP`;
      updateBtn.disabled = false;
    }
  });
}
