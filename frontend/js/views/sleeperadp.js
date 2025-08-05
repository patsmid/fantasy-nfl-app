import {
  fetchUniqueSleeperADPValues,
  updateSleeperADP
} from '../api.js';

export default async function renderADPView() {
  const container = document.getElementById('content-container');
  container.innerHTML = `
    <div class="card border-0 shadow-sm rounded flock-card">
      <div class="card-body">
        <div class="d-flex justify-content-between flex-wrap gap-2 align-items-center mb-4">
          <h4 class="m-0 d-flex align-items-center gap-2">
            <i class="bi bi-graph-up-arrow text-info"></i> ADP
          </h4>
          <div class="d-flex gap-2 align-items-center flex-wrap">
            <select id="adp-source-select" class="form-select form-select-sm bg-dark text-white border-secondary">
              <option value="sleeper" selected>Sleeper</option>
              <option value="fantasypros">FantasyPros</option>
            </select>
            <button id="update-sleeper-btn" class="btn btn-sm btn-primary d-flex align-items-center gap-2">
              <i class="bi bi-arrow-repeat"></i> Actualizar Sleeper
            </button>
            <button id="update-fp-btn" class="btn btn-sm btn-success d-flex align-items-center gap-2">
              <i class="bi bi-upload"></i> Actualizar FantasyPros
            </button>
          </div>
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
                <th></th><th></th><th></th><th></th><th></th>
                <th></th><th></th><th></th><th></th>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  `;

  const sourceSelect = document.getElementById('adp-source-select');
  let currentSource = sourceSelect.value;

  let table = null;

  const initTable = (source) => {
    const url =
      source === 'sleeper'
        ? 'https://fantasy-nfl-backend.onrender.com/sleeperADP'
        : 'https://fantasy-nfl-backend.onrender.com/adp/fantasypros/ppr';

    if (table) {
      table.destroy();
      document.querySelector('#adp-table').innerHTML = `
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
            <th></th><th></th><th></th><th></th><th></th>
            <th></th><th></th><th></th><th></th>
          </tr>
        </tfoot>
      `;
    }

    table = $('#adp-table').DataTable({
      processing: true,
      serverSide: source === 'sleeper',
      ajax: {
        url,
        dataSrc: 'data',
        data: function (d) {
          if (source === 'sleeper') {
            $('#adp-table tfoot select').each(function (index) {
              const val = this.value;
              if (val && val !== '') {
                d[`filter_col_${index}`] = val;
              }
            });
          }
        }
      },
      columns: [
        { data: 'id' },
        { data: 'adp_type', defaultContent: 'FP_ppr' },
        { data: 'sleeper_player_id', defaultContent: '' },
        { data: 'adp_value' },
        { data: 'adp_value_prev', defaultContent: '' },
        { data: 'date' },
        {
          data: source === 'fantasypros' ? 'player.full_name' : 'full_name',
          defaultContent: ''
        },
        {
          data: source === 'fantasypros' ? 'player.position' : 'position',
          defaultContent: ''
        },
        {
          data: source === 'fantasypros' ? 'player.team' : 'team',
          defaultContent: ''
        }
      ],
      order: [[3, 'asc']],
      pageLength: 10,
      lengthMenu: [10, 25, 50, 100],
      responsive: true,
      language: {
        url: '//cdn.datatables.net/plug-ins/2.3.2/i18n/es-MX.json'
      },
      initComplete: function () {
        if (source !== 'sleeper') return;

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
  };

  initTable(currentSource);

  sourceSelect.addEventListener('change', () => {
    currentSource = sourceSelect.value;
    initTable(currentSource);
  });

  const updateSleeperBtn = document.getElementById('update-sleeper-btn');
  updateSleeperBtn.addEventListener('click', async () => {
    updateSleeperBtn.disabled = true;
    updateSleeperBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Actualizando...`;
    try {
      await updateSleeperADP();
      table.ajax.reload();
    } catch (err) {
      alert('Error al actualizar Sleeper: ' + err.message);
    } finally {
      updateSleeperBtn.innerHTML = `<i class="bi bi-arrow-repeat"></i> Actualizar Sleeper`;
      updateSleeperBtn.disabled = false;
    }
  });

  const updateFPBtn = document.getElementById('update-fp-btn');
  updateFPBtn.addEventListener('click', async () => {
    updateFPBtn.disabled = true;
    updateFPBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Actualizando...`;
    try {
      const res = await fetch('https://fantasy-nfl-backend.onrender.com/adp/fantasypros/upload-all', {
        method: 'POST'
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Error inesperado');
      alert('ADP de FantasyPros actualizado exitosamente');
      if (currentSource === 'fantasypros') table.ajax.reload();
    } catch (err) {
      alert('Error al actualizar FantasyPros: ' + err.message);
    } finally {
      updateFPBtn.innerHTML = `<i class="bi bi-upload"></i> Actualizar FantasyPros`;
      updateFPBtn.disabled = false;
    }
  });
}
