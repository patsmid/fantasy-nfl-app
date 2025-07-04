import { fetchUniqueSleeperADPValues, updateSleeperADP } from '../api.js';

export default async function renderADPView() {
  const container = document.getElementById('content-container');
  container.innerHTML = `
    <div class="container mt-4">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h2 class="mb-0">ADP Sleeper</h2>
        <button id="update-adp-btn" class="btn btn-primary">
          <i class="bi bi-arrow-repeat"></i> Actualizar ADP
        </button>
      </div>

      <div class="table-responsive">
        <table id="adp-table" class="table table-bordered table-hover w-100">
          <thead class="table-light">
            <tr>
              <th>ID</th>
              <th>Tipo ADP</th>
              <th>Player ID</th>
              <th>Valor ADP</th>
              <th>Valor ADP Prev</th>
              <th>Fecha</th>
              <th>Nombre</th>
              <th>Posición</th>
              <th>Equipo</th>
            </tr>
          </thead>
          <tfoot>
            <tr>
              <th></th>  <!-- No filtro para ID -->
              <th></th>  <!-- Tipo ADP con select -->
              <th></th>  <!-- No filtro para Player ID -->
              <th></th>  <!-- No filtro para Valor ADP -->
              <th></th>  <!-- No filtro para Valor ADP Prev -->
              <th></th>  <!-- Fecha con select -->
              <th></th>  <!-- Nombre con select -->
              <th></th>  <!-- Posición con select -->
              <th></th>  <!-- Equipo con select -->
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  `;

  const table = $('#adp-table').DataTable({
    processing: true,
    serverSide: true,
    ajax: {
      url: `${API_BASE}/sleeperADP`,
      dataSrc: 'data',
      data: function (d) {
        // Pasar filtros tipo select al backend
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
    language: {
      url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json'
    },
    initComplete: function () {
      const api = this.api();

      // Columnas con filtro select y nombres para fetch
      const selectCols = [
        { index: 1, column: 'adp_type' },
        { index: 5, column: 'date' },
        { index: 6, column: 'full_name' },
        { index: 7, column: 'position' },
        { index: 8, column: 'team' }
      ];

      selectCols.forEach(async ({ index, column }) => {
        const columnDT = api.column(index);
        const select = $('<select class="form-select form-select-sm"><option value="">Todos</option></select>')
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

  // Botón actualizar ADP
  const updateBtn = document.getElementById('update-adp-btn');
  updateBtn.addEventListener('click', async () => {
    updateBtn.disabled = true;
    updateBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Actualizando...';
    await updateSleeperADP();
    updateBtn.innerHTML = '<i class="bi bi-arrow-repeat"></i> Actualizar ADP';
    updateBtn.disabled = false;
    table.ajax.reload();
  });
}
