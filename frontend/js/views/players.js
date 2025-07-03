import { fetchPlayers, updatePlayers } from '../api.js';

export default async function renderPlayersView() {
  const container = document.getElementById('main-content');
  container.innerHTML = `
    <h2>Jugadores</h2>
    <button id="update-btn" class="btn btn-primary mb-3">Actualizar</button>
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
      <tbody></tbody>
    </table>
  `;

  const updateBtn = document.getElementById('update-btn');
  updateBtn.addEventListener('click', async () => {
    updateBtn.disabled = true;
    updateBtn.textContent = 'Actualizando...';
    await updatePlayers();
    updateBtn.textContent = 'Actualizar';
    updateBtn.disabled = false;
    loadPlayersTable();
  });

  loadPlayersTable();
}

async function loadPlayersTable() {
  const data = await fetchPlayers();
	console.log(data);
  const tableBody = document.querySelector('#players-table tbody');
  tableBody.innerHTML = '';

  data.forEach(p => {
    const row = `
      <tr>
        <td>${p.id}</td>
        <td>${p.full_name}</td>
        <td>${p.position}</td>
        <td>${p.team || ''}</td>
        <td>${p.status || ''}</td>
      </tr>
    `;
    tableBody.insertAdjacentHTML('beforeend', row);
  });

  if (!window.DataTableInstance) {
    window.DataTableInstance = new DataTable('#players-table');
  } else {
    window.DataTableInstance.update();
  }
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
