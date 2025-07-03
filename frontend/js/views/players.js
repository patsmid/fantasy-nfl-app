import { fetchPlayers, updatePlayers } from '../api.js';

export default async function renderPlayersView() {
  const container = document.getElementById('main-content');
  container.innerHTML = \`
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
  \`;

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

  const tableBody = document.querySelector('#players-table tbody');
  tableBody.innerHTML = '';

  data.forEach(p => {
    const row = \`
      <tr>
        <td>\${p.id}</td>
        <td>\${p.full_name}</td>
        <td>\${p.position}</td>
        <td>\${p.team || ''}</td>
        <td>\${p.status || ''}</td>
      </tr>
    \`;
    tableBody.insertAdjacentHTML('beforeend', row);
  });

  if (!window.DataTableInstance) {
    window.DataTableInstance = new DataTable('#players-table');
  } else {
    window.DataTableInstance.update();
  }
}