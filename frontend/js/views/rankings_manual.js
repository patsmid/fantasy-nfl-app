import { fetchExperts } from '../api.js';
import { showSuccess, showError } from '../../components/alerts.js';

const BACKEND_URL = 'https://fantasy-nfl-backend.onrender.com';

export default async function renderManualRankingsView() {
  const content = document.getElementById('content-container');

  injectStyles(`
    @keyframes flashRow { 0%{background:rgba(40,167,69,.35)} 100%{background:transparent} }
    .row-flash { animation: flashRow .9s ease-out 1; }
  `);

  const experts = await fetchExperts();
  const manualExperts = experts.filter(e => e.source === 'manual');
  const expertOptions = manualExperts.map(e => `<option value="${e.id}">${e.experto}</option>`).join('');

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
          <div class="col-12 col-md-6">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h5>Jugadores por rankear</h5>
              <button class="btn btn-sm btn-secondary" id="btn-refresh-pending">Actualizar</button>
            </div>
            <table id="pendingPlayersTable" class="table table-dark table-striped w-100"></table>
          </div>

          <div class="col-12 col-md-6">
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
  let lastAddedPlayerId = null;

  expertSelect.addEventListener('change', async (e) => {
    currentExpertId = e.target.value;
    if (!currentExpertId) return;
    await renderPendingTable(currentExpertId);
    await renderRankingsTable(currentExpertId);
  });

  document.getElementById('btn-refresh-pending').addEventListener('click', () => {
    if (!currentExpertId) return showError('Selecciona un experto primero');
    pendingTable?.ajax?.reload(null, false);
  });
  document.getElementById('btn-refresh-rankings').addEventListener('click', () => {
    if (!currentExpertId) return showError('Selecciona un experto primero');
    rankingsTable?.ajax?.reload(null, false);
  });

  // ==========================
  // Pending players (server-side)
  // ==========================
  async function renderPendingTable(expertId) {
    if ($.fn.DataTable.isDataTable('#pendingPlayersTable')) {
      pendingTable.destroy();
      $('#pendingPlayersTable').empty();
    }

    pendingTable = $('#pendingPlayersTable').DataTable({
      serverSide: true,
      processing: true,
      ajax: {
        url: `${BACKEND_URL}/rankings/manual/pending`,
        type: 'GET',
        data: d => ({ ...d, expert_id: expertId, positions: 'WR,RB,TE,QB' }),
        dataSrc: d => d.players || []
      },
      columns: [
        { data: 'full_name', title: 'Nombre' },
        { data: 'position', title: 'Posición', width: '80px' },
        { data: 'team', title: 'Equipo', width: '80px' },
        {
          data: null,
          title: 'Acción',
          orderable: false,
          width: '60px',
          render: (row) => `
            <button class="btn btn-sm btn-primary btn-add" data-player-id="${row.player_id}">
              <i class="bi bi-arrow-right"></i>
            </button>`
        }
      ],
      pageLength: -1,           // mostrar todos
      lengthChange: false,
      responsive: true,
      searching: true,
      language: { url: '//cdn.datatables.net/plug-ins/2.3.2/i18n/es-MX.json' }
    });

    // Agregar jugador a rankings
    $('#pendingPlayersTable tbody').off('click').on('click', '.btn-add', async function () {
      if (!currentExpertId) return showError('Selecciona un experto primero');

      const $btn = $(this);
      const player_id = $btn.data('playerId');
      const $row = $btn.closest('tr');

      if ($btn.prop('disabled')) return;
      $btn.prop('disabled', true).addClass('disabled');

      try {
        // 1) obtener lastRank + 1 (tolerante)
        let lastRank = 0;
        try {
          const resp = await fetch(`${BACKEND_URL}/rankings/manual?expert_id=${currentExpertId}`);
          if (resp.ok) {
            const json = await resp.json();
            const players = json?.players || [];
            lastRank = players.reduce((max, p) => Math.max(max, p.rank || 0), 0);
          }
        } catch {}

        // 2) upsert (evita duplicado)
        const post = await fetch(`${BACKEND_URL}/rankings/manual`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expert_id: currentExpertId,
            sleeper_player_id: player_id,
            rank: lastRank + 1,
            tier: null
          })
        });
        const result = await post.json();
        if (!post.ok || !result.success) throw new Error(result.error || 'No se pudo agregar');

        lastAddedPlayerId = player_id;

        // 3) animar y remover de pending (sin esperar reload)
        $row.css('background-color', 'rgba(40,167,69,.35)');
        $row.fadeOut(250, () => {
          pendingTable.row($row).remove().draw(false);
        });

        // 4) recargar rankings y resaltar el insertado
        rankingsTable.ajax.reload(() => {
          flashInRankings(lastAddedPlayerId);
        }, false);

        showSuccess('Jugador agregado al ranking');
      } catch (err) {
        showError(err.message);
        $btn.prop('disabled', false).removeClass('disabled');
      }
    });
  }

  function flashInRankings(playerId) {
    $('#manualRankingsTable').one('draw.dt', () => {
      const idx = rankingsTable
        .rows()
        .indexes()
        .toArray()
        .find(i => rankingsTable.row(i).data()?.player_id === playerId);

      if (idx !== undefined) {
        const tr = $(rankingsTable.row(idx).node());
        tr.addClass('row-flash');
        setTimeout(() => tr.removeClass('row-flash'), 900);
      }
    });
  }

  // ==========================
  // Rankings (client-side + Sortable)
  // ==========================
  async function renderRankingsTable(expertId) {
    if ($.fn.DataTable.isDataTable('#manualRankingsTable')) {
      rankingsTable.destroy();
      $('#manualRankingsTable').empty();
    }

    rankingsTable = $('#manualRankingsTable').DataTable({
      serverSide: false,
      processing: true,
      ajax: {
        url: `${BACKEND_URL}/rankings/manual`,
        type: 'GET',
        data: () => ({ expert_id: expertId }),
        dataSrc: d => d.players || []
      },
      columns: [
        {
          data: null,
          title: '',
          orderable: false,
          width: '28px',
          className: 'text-muted',
          render: () => `<span class="drag-handle" title="Arrastrar"><i class="bi bi-grip-vertical"></i></span>`
        },
        { data: 'full_name', title: 'Nombre' },
        { data: 'position', title: 'Posición', width: '80px' },
        { data: 'team', title: 'Equipo', width: '80px' },
        {
          data: 'rank',
          title: 'Rank',
          width: '100px',
          render: (data, type, row) =>
            `<input type="number" class="form-control form-control-sm bg-dark text-white rank-tier-input" value="${data ?? ''}" data-id="${row.id}" data-field="rank">`
        },
        {
          data: 'tier',
          title: 'Tier',
          width: '100px',
          render: (data, type, row) =>
            `<input type="number" class="form-control form-control-sm bg-dark text-white rank-tier-input" value="${data ?? ''}" data-id="${row.id}" data-field="tier">`
        },
        {
          data: null,
          title: 'Eliminar',
          orderable: false,
          width: '70px',
          render: (row) => `
            <button class="btn btn-sm btn-danger btn-delete" data-id="${row.id}">
              <i class="bi bi-trash"></i>
            </button>`
        }
      ],
      rowId: row => `rank-${row.id}`,
      pageLength: 50,
      responsive: true,
      searching: true,
      ordering: false,
      language: { url: '//cdn.datatables.net/plug-ins/2.3.2/i18n/es-MX.json' }
    });

    // Re-aplicar Sortable tras cada draw
    $('#manualRankingsTable').off('draw.dt').on('draw.dt', () => setupSortable());

    setupSortable(); // primera vez

    // Inline edit
    $('#manualRankingsTable tbody').off('change').on('change', '.rank-tier-input', async function () {
      const id = this.dataset.id;
      const field = this.dataset.field;
      const value = this.value ? parseInt(this.value) : null;

      try {
        const resp = await fetch(`${BACKEND_URL}/rankings/manual/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [field]: value })
        });
        const out = await resp.json();
        if (!resp.ok) throw new Error(out.error || 'No se pudo actualizar');

        showSuccess(`${capitalize(field)} actualizado`);
        if (field === 'rank') rankingsTable.ajax.reload(null, false);
      } catch (err) {
        showError(`Error al actualizar ${field}: ${err.message}`);
      }
    });

    // Eliminar
    $('#manualRankingsTable tbody').off('click').on('click', '.btn-delete', async function () {
      const id = this.dataset.id;
      try {
        const del = await fetch(`${BACKEND_URL}/rankings/manual/${id}`, { method: 'DELETE' });
        const out = await del.json();
        if (!del.ok) throw new Error(out.error || 'No se pudo eliminar');

        showSuccess('Jugador eliminado');
        rankingsTable.ajax.reload(null, false);
        pendingTable.ajax.reload(null, false); // vuelve a aparecer en pending
      } catch (err) {
        showError(err.message);
      }
    });
  }

  // ===== Sortable (sin import): carga dinámica desde CDN si no existe) =====
  async function ensureSortable() {
    if (window.Sortable) return;
    await loadScript('https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js');
  }
  async function setupSortable() {
    await ensureSortable();
    const tbody = document.querySelector('#manualRankingsTable tbody');
    if (!tbody || tbody._sortableAttached) return;
    tbody._sortableAttached = true;

    window.Sortable.create(tbody, {
      animation: 150,
      handle: '.drag-handle',
      onEnd: async () => {
        const updates = [];
        $('#manualRankingsTable tbody tr').each((i, tr) => {
          const id = tr.id.replace('rank-', '');
          updates.push({ id: parseInt(id, 10), rank: i + 1 });
        });

        try {
          const res = await fetch(`${BACKEND_URL}/rankings/manual/order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
          });
          const out = await res.json();
          if (!res.ok) throw new Error(out.error || 'No se pudo guardar el orden');
          showSuccess('Orden actualizado');
          rankingsTable.ajax.reload(null, false);
        } catch (err) {
          showError('Error al guardar orden: ' + err.message);
        }
      }
    });
  }

  // helpers
  function injectStyles(css) {
    const tag = document.createElement('style');
    tag.textContent = css;
    document.head.appendChild(tag);
  }
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
      document.head.appendChild(s);
    });
  }
  function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
}
