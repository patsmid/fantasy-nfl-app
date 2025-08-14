import { fetchExperts } from '../api.js';
import { showSuccess, showError, showLoadingBar } from '../../components/alerts.js';

const BACKEND_URL = 'https://fantasy-nfl-backend.onrender.com';

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
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h5>Jugadores por rankear</h5>
              <button class="btn btn-sm btn-secondary" id="btn-refresh-pending">Actualizar</button>
            </div>
            <table id="pendingPlayersTable" class="table table-dark table-striped w-100"></table>
          </div>

          <div class="col-6">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h5>Rankings actuales</h5>
              <button class="btn btn-sm btn-secondary" id="btn-refresh-rankings">Actualizar</button>
            </div>
            <table id="manualRankingsTable" class="table table-dark table-striped w-100"></table>
          </div>
        </div>
      </div>
    </div>
  `;

  const expertSelect = document.getElementById('manual-expert');
  let pendingTable, rankingsTable;
  let currentExpertId = null;

  expertSelect.addEventListener('change', async (e) => {
    currentExpertId = e.target.value;
    if (!currentExpertId) return;
    await loadTables(currentExpertId);
  });

  document.getElementById('btn-refresh-pending').addEventListener('click', async () => {
    if (!currentExpertId) return showError('Selecciona un experto primero');
    pendingTable.ajax.reload(null, false);
  });
  document.getElementById('btn-refresh-rankings').addEventListener('click', async () => {
    if (!currentExpertId) return showError('Selecciona un experto primero');
    rankingsTable.ajax.reload(null, false);
  });

  async function loadTables(expertId) {
    await Promise.all([renderPendingTable(expertId), renderRankingsTable(expertId)]);
  }

  // ==========================
  // Pending players
  // ==========================
  async function renderPendingTable(expertId) {
    if ($.fn.DataTable.isDataTable('#pendingPlayersTable')) {
      pendingTable.destroy();
      $('#pendingPlayersTable tbody').empty();
    }

    pendingTable = $('#pendingPlayersTable').DataTable({
      serverSide: true,
      processing: true,
      ajax: {
        url: `${BACKEND_URL}/rankings/manual/pending`,
        type: 'GET',
        data: function(d) {
          return {
            ...d,
            expert_id: expertId,
            positions: 'WR,RB,TE,QB'
          };
        },
        dataSrc: d => d.players
      },
      columns: [
        { data: 'full_name', title: 'Nombre' },
        { data: 'position', title: 'Posición' },
        { data: 'team', title: 'Equipo' },
        {
          data: null,
          title: 'Acción',
          render: (data, type, row) => {
            // codificamos el objeto para evitar errores de JSON.parse
            const playerData = encodeURIComponent(JSON.stringify(row));
            return `<button class="btn btn-sm btn-primary btn-add" data-player='${playerData}'>
                      <i class="bi bi-arrow-right"></i>
                    </button>`;
          }
        }
      ],
      pageLength: 50,
      responsive: true,
      searching: true,
      language: { url: '//cdn.datatables.net/plug-ins/2.3.2/i18n/es-MX.json' }
    });

    // Botón agregar a rankings
    $('#pendingPlayersTable tbody').off('click', '.btn-add').on('click', '.btn-add', async function() {
      const btn = this;
      const player = JSON.parse(decodeURIComponent(btn.dataset.player));
      try {
        // Obtener último rank actual
        const rankingsData = rankingsTable.rows().data().toArray();
        const lastRank = rankingsData.length ? Math.max(...rankingsData.map(r => r.rank || 0)) : 0;

        const resp = await fetch(`${BACKEND_URL}/rankings/manual`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expert_id: currentExpertId,
            sleeper_player_id: player.player_id,
            rank: lastRank + 1,
            tier: 1
          })
        });
        const result = await resp.json();
        if (!result.success) throw new Error(result.error || 'Error al agregar jugador');

        showSuccess(`${player.full_name} agregado al ranking`);

        // Recargar tablas
        pendingTable.ajax.reload(null, false);
        rankingsTable.ajax.reload(null, false);

      } catch (err) {
        showError(err.message);
      }
    });
  }

  // ==========================
  // Rankings actuales
  // ==========================
  async function renderRankingsTable(expertId) {
    if ($.fn.DataTable.isDataTable('#manualRankingsTable')) {
      rankingsTable.destroy();
      $('#manualRankingsTable tbody').empty();
    }

    rankingsTable = $('#manualRankingsTable').DataTable({
      serverSide: true,
      processing: true,
      ajax: {
        url: `${BACKEND_URL}/rankings/manual`,
        type: 'GET',
        data: function(d) { return { expert_id: expertId }; },
        dataSrc: d => d.players.map(p => ({
          id: p.id,
          player_id: p.player_id,
          full_name: p.full_name,
          position: p.position,
          team: p.team,
          rank: p.rank !== null && p.rank !== undefined ? p.rank : 0,
          tier: p.tier !== null && p.tier !== undefined ? p.tier : 1
        }))
      },
      columns: [
        { data: 'full_name', title: 'Nombre' },
        { data: 'position', title: 'Posición' },
        { data: 'team', title: 'Equipo' },
        {
          data: 'rank',
          title: 'Rank',
          render: (data, type, row) =>
            `<input type="number" class="form-control form-control-sm bg-dark text-white rank-tier-input" value="${data}" data-id="${row.id}" data-field="rank">`
        },
        {
          data: 'tier',
          title: 'Tier',
          render: (data, type, row) =>
            `<input type="number" class="form-control form-control-sm bg-dark text-white rank-tier-input" value="${data}" data-id="${row.id}" data-field="tier">`
        },
        {
          data: null,
          title: 'Eliminar',
          render: (data, type, row) =>
            `<button class="btn btn-sm btn-danger btn-delete" data-id="${row.id}"><i class="bi bi-trash"></i></button>`
        }
      ],
      pageLength: 50,
      responsive: true,
      searching: true,
      order: [[3, 'asc']],
      language: { url: '//cdn.datatables.net/plug-ins/2.3.2/i18n/es-MX.json' }
    });

    // Inline update rank/tier
    $('#manualRankingsTable tbody').off('change', '.rank-tier-input').on('change', '.rank-tier-input', async function() {
      const input = this;
      const id = input.dataset.id;
      const field = input.dataset.field;
      const value = input.value ? parseInt(input.value) : null;
      try {
        await fetch(`${BACKEND_URL}/rankings/manual/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [field]: value })
        });
        showSuccess(`${field.charAt(0).toUpperCase() + field.slice(1)} actualizado`);
        if (field === 'rank') rankingsTable.order([3, 'asc']).draw();
      } catch (err) {
        showError(`Error al actualizar ${field}: ${err.message}`);
      }
    });

    // Botón eliminar
    $('#manualRankingsTable tbody').off('click', '.btn-delete').on('click', '.btn-delete', async function() {
      const id = this.dataset.id;
      try {
        await fetch(`${BACKEND_URL}/rankings/manual/${id}`, { method: 'DELETE' });
        showSuccess('Jugador eliminado del ranking');

        rankingsTable.ajax.reload(null, false);
        pendingTable.ajax.reload(null, false);
      } catch (err) {
        showError('Error al eliminar jugador: ' + err.message);
      }
    });
  }
}
