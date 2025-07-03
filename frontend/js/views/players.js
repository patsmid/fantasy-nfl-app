export async function renderPlayers() {
  const container = document.getElementById('content');
  container.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h2>Jugadores</h2>
      <button id="btn-update-players" class="btn btn-primary">Actualizar</button>
    </div>
    <table id="players-table" class="table table-striped" style="width:100%">
      <thead>
        <tr>
          <th>ID</th>
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
  `;

  document.getElementById('btn-update-players').addEventListener('click', async () => {
    try {
      const res = await fetch('/players');
      const text = await res.text();
      console.log("📦 Respuesta cruda:", text);

      let result;
      try {
        result = JSON.parse(text);
      } catch (e) {
        console.error("❌ Error parseando JSON:", e.message);
        alert("Error procesando respuesta del servidor. Revisa la consola.");
        return;
      }

      alert(`Se actualizaron ${result.updated} jugadores`);
    } catch (error) {
      console.error('❌ Error al actualizar jugadores:', error.message || error);
      alert("Error de red al llamar /update-players");
    }
  });

  loadPlayersTable();
}
