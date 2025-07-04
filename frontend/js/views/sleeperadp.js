import { fetchSleeperADP, updateSleeperADP } from '../api.js';

export default async function renderADPView() {
  const container = document.getElementById('content-container');
  container.innerHTML = `
    <div class="container mt-4">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h2 class="mb-0">ADP Sleeper</h2>
        <button id="update-btn" class="btn btn-primary">
          <i class="fas fa-sync-alt"></i> Actualizar ADP
        </button>
      </div>

      <div class="table-responsive">
        <table id="adp-table" class="table table-bordered table-hover w-100">
          <thead class="table-light">
            <tr>
              <th>ID</th>
              <th>Tipo ADP</th>
              <th>ID Jugador Sleeper</th>
              <th>Valor ADP</th>
              <th>Valor ADP previo</th>
              <th>Fecha</th>
            </tr>
          </thead>
          <tfoot>
            <tr>
              <th>ID</th>
              <th>Tipo ADP</th>
              <th>ID Jugador Sleeper</th>
              <th>Valor ADP</th>
              <th>Valor ADP previo</th>
              <th>Fecha</th>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  `;

  // Agrega inputs de filtro en cada columna del footer
  $('#adp-table tfoot th').each(function () {
    const title = $(this).text();
    $(this).html(`<input type="text" class="form-control form-control-sm" placeholder="Filtrar ${title}" />`);
  });

  const table = $('#adp-table').DataTable({
    processing: true,
    serverSide: true,
    ajax: {
      url: 'https://fantasy-nfl-backend.onrender.com/sleeperADP',
      dataSrc: 'data',
      data: function (d) {
        $('#adp-table tfoot input').each(function (index) {
          const value = this.value;
          if (value) {
            d[`filter_col_${index}`] = value;
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
      { data: 'date' }
    ],
    pageLength: 10,
    lengthMenu: [10, 25, 50, 100],
    language: {
      url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json'
    }
  });

  $('#adp-table tfoot input').on('keyup change', function () {
    table.ajax.reload();
  });

  const updateBtn = document.getElementById('update-btn');
  updateBtn.addEventListener('click', async () => {
    updateBtn.disabled = true;
    updateBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Actualizando...';
    await updateSleeperADP();
    updateBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Actualizar ADP';
    updateBtn.disabled = false;
    table.ajax.reload();
  });
}
