export async function renderPlayers() {
  document.getElementById('content').innerHTML = `
    <div class="container-fluid mt-3">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h2>Jugadores</h2>
        <button id="btn-update-players" class="btn btn-primary btn-sm">
          <i class="fas fa-sync-alt"></i> Actualizar Jugadores
        </button>
      </div>

      <div class="row mb-3">
        <div class="col-md-3">
          <label>Posición:</label>
          <select id="filter-position" class="form-control"><option value="">Todas</option></select>
        </div>
        <div class="col-md-3">
          <label>Equipo:</label>
          <select id="filter-team" class="form-control"><option value="">Todos</option></select>
        </div>
        <div class="col-md-3">
          <label>Estatus:</label>
          <select id="filter-status" class="form-control"><option value="">Todos</option></select>
        </div>
        <div class="col-md-3">
          <label>Años de Experiencia:</label>
          <select id="filter-years-exp" class="form-control"><option value="">Todos</option></select>
        </div>
      </div>

      <table id="players-table" class="table table-striped table-bordered" style="width:100%">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Posición</th>
            <th>Equipo</th>
            <th>Status</th>
            <th>Lesión</th>
            <th>Años Exp</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
  `;

  const table = new DataTable('#players-table', {
    ajax: {
      url: '/players',
      dataSrc: 'data'
    },
    paging: true,
    pageLength: 25,
    searching: true,
    ordering: true,
    columns: [
      { data: 'full_name' },
      { data: 'position' },
      { data: 'team' },
      { data: 'status' },
      { data: 'injury_status' },
      { data: 'years_exp' },
    ],
    dom: 'Bfrtip',
    buttons: [
      {
        extend: 'excelHtml5',
        text: '<i class="fas fa-file-excel"></i> Exportar a Excel',
        className: 'btn btn-success btn-sm'
      }
    ],
    initComplete: function () {
      const api = this.api();

      const filters = [
        { field: 'position', index: 1 },
        { field: 'team', index: 2 },
        { field: 'status', index: 3 },
        { field: 'years_exp', index: 5 }
      ];

      filters.forEach(({ field, index }) => {
        const select = document.getElementById(`filter-${field}`);
        const col = api.column(index);

        const unique = new Set();
        col.data().each(d => { if (d !== null && d !== undefined && d !== '') unique.add(d); });

        [...unique].sort().forEach(val => {
          const opt = document.createElement('option');
          opt.value = val;
          opt.textContent = val;
          select.appendChild(opt);
        });

        select.addEventListener('change', () => {
          const val = select.value;
          col.search(val ? `^${val}$` : '', true, false).draw();
        });
      });
    },
    language: {
      url: '//cdn.datatables.net/plug-ins/1.13.7/i18n/es-ES.json'
    }
  });

  // Botón actualizar jugadores
  document.getElementById('btn-update-players').addEventListener('click', async () => {
    const btn = document.getElementById('btn-update-players');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Actualizando...';

    try {
      const response = await fetch('/update-players');
      const result = await response.json();
      if (result.success) {
        alert(`Se actualizaron ${result.updated} jugadores.`);
        table.ajax.reload();
      } else {
        alert('Ocurrió un error al actualizar los jugadores.');
        console.error(result.error);
      }
    } catch (err) {
      console.error('Error en actualización:', err);
      alert('Error al actualizar jugadores.');
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-sync-alt"></i> Actualizar Jugadores';
  });
}





// //
// import { fetchPlayers, updatePlayers } from '../api.js';
//
// export default async function renderPlayers() {
//   const response = await fetch('/players');
//   const data = await response.json();
//
//   const container = document.getElementById('main-content');
//   container.innerHTML = `
//     <div class="d-flex justify-content-between align-items-center mb-3">
//       <h2>Jugadores</h2>
//       <button class="btn btn-primary" id="btnActualizar">Actualizar</button>
//     </div>
//     <table id="playersTable" class="table table-striped w-100">
//       <thead>
//         <tr>
//           <th>ID</th>
//           <th>Nombre</th>
//           <th>Posición</th>
//           <th>Equipo</th>
//           <th>Status</th>
//           <th>Injury</th>
//           <th>Experiencia</th>
//         </tr>
//       </thead>
//       <tbody></tbody>
//     </table>
//   `;
//
//   const tableBody = container.querySelector('#playersTable tbody');
//   data.forEach(player => {
//     tableBody.innerHTML += `
//       <tr>
//         <td>${player.id}</td>
//         <td>${player.full_name}</td>
//         <td>${player.position || '-'}</td>
//         <td>${player.team || '-'}</td>
//         <td>${player.status || '-'}</td>
//         <td>${player.injury_status || '-'}</td>
//         <td>${player.years_exp ?? '-'}</td>
//       </tr>
//     `;
//   });
//
//   // Inicializar DataTables
//   new DataTable('#playersTable');
//
//   // Botón actualizar
//   document.getElementById('btnActualizar').addEventListener('click', async () => {
//     const res = await fetch('/update-players');
//     const result = await res.json();
//     alert(`Se actualizaron ${result.updated} jugadores`);
//   });
// }
