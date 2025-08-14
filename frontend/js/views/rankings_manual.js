import { fetchExperts } from '../api.js';
import { showSuccess, showError, showLoadingBar } from '../../components/alerts.js';

export default async function renderManualRankingsView() {
  const content = document.getElementById('content-container');

  const experts = await fetchExperts();
  const manualExperts = experts.filter(e => e.source === 'manual');

  const expertOptions = manualExperts
    .map(e => `<option value="${e.id}">${e.experto}</option>`)
    .join('');

  content.innerHTML = `
    <div class="card border-0 shadow-sm rounded flock-card">
      <div class="card-body">
        <h4 class="mb-4"><i class="bi bi-pencil-square text-warning"></i> Rankings manuales</h4>
        <div class="mb-3">
          <label class="form-label">Experto</label>
          <select class="form-select" id="manual-expert">
            <option value="">Selecciona experto...</option>
            ${expertOptions}
          </select>
        </div>

        <div class="row g-4">
          <div class="col-6">
            <h5>Jugadores por rankear</h5>
            <table id="pendingPlayersTable" class="table table-dark table-striped w-100">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Posición</th>
                  <th>Equipo</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>

          <div class="col-6">
            <h5>Rankings actuales</h5>
            <table id="manualRankingsTable" class="table table-dark table-striped w-100">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Posición</th>
                  <th>Equipo</th>
                  <th>Rank</th>
                  <th>Tier</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;

  const expertSelect = document.getElementById('manual-expert');
  let pendingTable, rankingsTable;

  expertSelect.addEventListener('change', async (e) => {
    const expertId = e.target.value;
    if (!expertId) return;

    try {
      showLoadingBar('Cargando jugadores...');
      const [pendingRes, rankingsRes] = await Promise.all([
        fetch(`https://fantasy-nfl-backend.onrender.com/rankings/manual/pending?expert_id=${expertId}`).then(r => r.json()),
        fetch(`https://fantasy-nfl-backend.onrender.com/rankings/manual?expert_id=${expertId}`).then(r => r.json())
      ]);
      Swal.close();

      // Tabla jugadores pendientes
      const pendingTbody = document.querySelector('#pendingPlayersTable tbody');
      pendingTbody.innerHTML = '';
      pendingRes.players.forEach(p => {
        pendingTbody.innerHTML += `
          <tr>
            <td>${p.full_name}</td>
            <td>${p.position}</td>
            <td>${p.team}</td>
            <td>
              <button class="btn btn-sm btn-primary btn-add" data-player='${JSON.stringify(p)}'>
                <i class="bi bi-arrow-right"></i>
              </button>
            </td>
          </tr>
        `;
      });

      // Tabla rankings actuales
      const rankingsTbody = document.querySelector('#manualRankingsTable tbody');
      rankingsTbody.innerHTML = '';
      rankingsRes.players.forEach(p => {
        rankingsTbody.innerHTML += `
          <tr>
            <td>${p.full_name}</td>
            <td>${p.position}</td>
            <td>${p.team}</td>
            <td><input type="number" class="form-control form-control-sm bg-dark text-white rank-tier-input" value="${p.rank || ''}" data-id="${p.id}" data-field="rank"></td>
            <td><input type="number" class="form-control form-control-sm bg-dark text-white rank-tier-input" value="${p.tier || ''}" data-id="${p.id}" data-field="tier"></td>
          </tr>
        `;
      });

      // Inicializar DataTables
      if ($.fn.DataTable.isDataTable('#pendingPlayersTable')) $('#pendingPlayersTable').DataTable().clear().destroy();
      if ($.fn.DataTable.isDataTable('#manualRankingsTable')) $('#manualRankingsTable').DataTable().clear().destroy();

      pendingTable = $('#pendingPlayersTable').DataTable({
        responsive: true,
        pageLength: 20,
        language: { url: '//cdn.datatables.net/plug-ins/2.3.2/i18n/es-MX.json' }
      });

      rankingsTable = $('#manualRankingsTable').DataTable({
        responsive: true,
        pageLength: 20,
        order: [[3, 'asc']], // Ordenar automáticamente por Rank
        language: { url: '//cdn.datatables.net/plug-ins/2.3.2/i18n/es-MX.json' }
      });

      // Mover jugadores de pendientes a rankings actuales
      document.querySelectorAll('.btn-add').forEach(btn => {
        btn.addEventListener('click', async () => {
          const player = JSON.parse(btn.dataset.player);
          try {
            const resp = await fetch('https://fantasy-nfl-backend.onrender.com/rankings/manual', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ expert_id: expertId, sleeper_player_id: player.player_id, rank: null, tier: null })
            });
            const result = await resp.json();
            if (!result.success) throw new Error(result.error || 'Error al agregar jugador');

            showSuccess(`${player.full_name} agregado al ranking`);

            pendingTable.row(btn.closest('tr')).remove().draw();

            rankingsTable.row.add([
              player.full_name,
              player.position,
              player.team,
              `<input type="number" class="form-control form-control-sm bg-dark text-white rank-tier-input" value="" data-id="${result.data[0].id}" data-field="rank">`,
              `<input type="number" class="form-control form-control-sm bg-dark text-white rank-tier-input" value="" data-id="${result.data[0].id}" data-field="tier">`
            ]).draw();

            rankingsTable.order([3, 'asc']).draw(); // Reordenar por Rank
            attachInlineUpdate();
          } catch (err) {
            showError(err.message);
          }
        });
      });

      // Actualizar Rank/Tier al cambiar
      function attachInlineUpdate() {
        document.querySelectorAll('.rank-tier-input').forEach(input => {
          input.addEventListener('change', async () => {
            const id = input.dataset.id;
            const field = input.dataset.field;
            const value = input.value ? parseInt(input.value) : null;

            try {
              await fetch(`https://fantasy-nfl-backend.onrender.com/rankings/manual/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [field]: value })
              });
              showSuccess(`${field.charAt(0).toUpperCase() + field.slice(1)} actualizado`);

              if (field === 'rank') {
                rankingsTable.order([3, 'asc']).draw(); // Reordenar por Rank
              }
            } catch (err) {
              showError(`Error al actualizar ${field}: ${err.message}`);
            }
          });
        });
      }

      attachInlineUpdate();

    } catch (err) {
      showError('Error al cargar jugadores/rankings: ' + err.message);
    }
  });
}
