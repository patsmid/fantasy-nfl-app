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

  // Botones de refresco
  document.getElementById('btn-refresh-pending').addEventListener('click', () => {
    if (!currentExpertId) return showError('Selecciona un experto primero');
    pendingTable.ajax.reload(null, false);
  });
  document.getElementById('btn-refresh-rankings').addEventListener('click', () => {
    if (!currentExpertId) return showError('Selecciona un experto primero');
    rankingsTable.ajax.reload(null, false);
  });

  async function loadTables(expertId) {
    await Promise.all([renderPendingTable(expertId), renderRankingsTable(expertId)]);
  }

  // ==========================
  // Pending players con server-side
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
          orderable: false,
          render: (data, type, row) =>
            `<button class="btn btn-sm btn-primary btn-add" data-player='${JSON.stringify(row)}'>
              <i class="bi bi-arrow-right"></i>
            </button>`
        }
      ],
      pageLength: 50,
      responsive: true,
      searching: true,
      language: { url: '//cdn.datatables.net/plug-ins/2.3.2/i18n/es-MX.json' }
    });

    attachAddButtons();
  }

  function attachAddButtons() {
    $('#pendingPlayersTable tbody').off('click', '.btn-add').on('click', '.btn-add', async function() {
      const btn = this;
      const player = JSON.parse(btn.dataset.player);
      try {
        // POST con rank/tier por defecto 0
        const resp = await fetch(`${BACKEND_URL}/rankings/manual`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expert_id: currentExpertId,
            sleeper_player_id: player.player_id,
            rank: 0,
            tier: 0
          })
        });
        const result = await resp.json();
        if (!result.success) throw new Error(result.error || 'Error al agregar jugador');

        showSuccess(`${player.full_name} agregado al ranking`);

        // Remover de Pending
        pendingTable.row($(btn).closest('tr')).remove().draw();

        // Agregar a Rankings
        const newId = result.data[0].id;
        rankingsTable.row.add([
          player.full_name,
          player.position,
          player.team,
          `<input type="number" class="form-control form-control-sm bg-dark text-white rank-tier-input" value="0" data-id="${newId}" data-field="rank">`,
          `<input type="number" class="form-control form-control-sm bg-dark text-white rank-tier-input" value="0" data-id="${newId}" data-field="tier">`
        ]).draw();

        attachInlineUpdate();
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
          rank: p.rank,
          tier: p.tier
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
            `<input type="number" class="form-control form-control-sm bg-dark text-white rank-tier-input" value="${data || 0}" data-id="${row.id}" data-field="rank">`
        },
        {
          data: 'tier',
          title: 'Tier',
          render: (data, type, row) =>
            `<input type="number" class="form-control form-control-sm bg-dark text-white rank-tier-input" value="${data || 0}" data-id="${row.id}" data-field="tier">`
        }
      ],
      pageLength: 50,
      responsive: true,
      searching: true,
      order: [[3, 'asc']],
      language: { url: '//cdn.datatables.net/plug-ins/2.3.2/i18n/es-MX.json' }
    });

    $('#manualRankingsTable tbody').off('change').on('change', '.rank-tier-input', async function() {
      const input = this;
      const id = input.dataset.id;
      const field = input.dataset.field;
      const value = input.value ? parseInt(input.value) : 0;

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
  }
}
