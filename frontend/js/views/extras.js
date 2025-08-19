// extras.js
const API_BASE = 'https://fantasy-nfl-backend.onrender.com';

export default async function renderExtrasView() {
  // --------- Alerts helpers (con fallback) ---------
  let showSuccess, showError, showConfirm;
  try {
    const alerts = await import('../../components/alerts.js');
    showSuccess = alerts.showSuccess;
    showError = alerts.showError;
    showConfirm = alerts.showConfirm;
  } catch (err) {
    showError = (msg) => { console.error(msg); alert(msg); };
    showSuccess = (msg) => { console.log(msg); alert(msg); };
    showConfirm = async ({ text }) => ({ isConfirmed: confirm(text || '¿Confirmar?') });
  }

  // --------- Auth helpers ---------
  async function getAccessToken() {
    try {
      // Intenta importar tu cliente de supabase del frontend
      const mod = await import('../../components/supabaseClient.js').catch(() => null);
      const supa = mod?.supabase || window?.supabase;
      if (!supa) return null;
      const { data: { session } } = await supa.auth.getSession();
      return session?.access_token || null;
    } catch {
      return null;
    }
  }

  async function authedFetch(path, opts = {}) {
    const token = await getAccessToken();
    if (!token) {
      showError('Debes iniciar sesión.');
      window.location.hash = '#/login';
      throw new Error('UNAUTHENTICATED');
    }
    const headers = new Headers(opts.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    if (opts.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
    if (res.status === 401 || res.status === 403) {
      showError('Tu sesión expiró. Inicia sesión nuevamente.');
      window.location.hash = '#/login';
      throw new Error('UNAUTHORIZED');
    }
    return res;
  }

  // --------- Montaje de la vista ---------
  const content = document.getElementById('content-container');
  if (!content) {
    showError('No se encontró el contenedor de contenido.');
    return;
  }

  // Verifica sesión antes de renderizar
  const token = await getAccessToken();
  if (!token) {
    showError('Debes iniciar sesión.');
    window.location.hash = '#/login';
    return;
  }

  content.innerHTML = `
    <div class="row g-4">
      <!-- Links -->
      <div class="col-12">
        <div class="card border-0 shadow-sm rounded flock-card">
          <div class="card-header bg-secondary bg-opacity-10 border-bottom border-secondary pb-2 mb-4">
            <h5 class="m-0 d-flex align-items-center gap-2 text-warning">
              <i class="bi bi-bookmarks-fill"></i> Links de interés
            </h5>
          </div>
          <div class="card-body">
            <div class="d-flex justify-content-end mb-3">
              <button class="btn btn-sm btn-primary" id="btn-add-link">
                <i class="bi bi-plus-circle me-1"></i> Agregar
              </button>
            </div>
            <ul class="list-group list-group-flush" id="linksList"></ul>
          </div>
        </div>
      </div>

      <!-- Notas -->
      <div class="col-12">
        <div class="card border-0 shadow-sm rounded flock-card">
          <div class="card-header bg-secondary bg-opacity-10 border-bottom border-secondary pb-2 mb-4">
            <h5 class="m-0 d-flex align-items-center gap-2 text-info">
              <i class="bi bi-journal-text"></i> Notas
            </h5>
          </div>
          <div class="card-body">
            <div class="d-flex justify-content-end mb-3">
              <button class="btn btn-sm btn-primary" id="btn-add-note">
                <i class="bi bi-plus-circle me-1"></i> Agregar
              </button>
            </div>
            <div id="notesList" class="d-flex flex-column gap-3"></div>
          </div>
        </div>
      </div>

      <!-- Pendientes -->
      <div class="col-12">
        <div class="card border-0 shadow-sm rounded flock-card">
          <div class="card-header bg-secondary bg-opacity-10 border-bottom border-secondary pb-2 mb-4">
            <h5 class="m-0 d-flex align-items-center gap-2 text-success">
              <i class="bi bi-check2-square"></i> Pendientes
            </h5>
          </div>
          <div class="card-body">
            <div class="d-flex justify-content-end mb-3">
              <button class="btn btn-sm btn-primary" id="btn-add-task">
                <i class="bi bi-plus-circle me-1"></i> Agregar
              </button>
            </div>
            <ul class="list-group list-group-flush" id="taskList"></ul>
          </div>
        </div>
      </div>
    </div>

    <!-- Modales -->
    ${renderLinkModal()}
    ${renderNoteModal()}
    ${renderTaskModal()}
  `;

  // Instancias Modals
  const linkModalEl = document.getElementById('linkModal');
  const noteModalEl = document.getElementById('noteModal');
  const taskModalEl = document.getElementById('taskModal');
  const modalLink = linkModalEl ? new bootstrap.Modal(linkModalEl) : null;
  const modalNote = noteModalEl ? new bootstrap.Modal(noteModalEl) : null;
  const modalTask = taskModalEl ? new bootstrap.Modal(taskModalEl) : null;

  const getModalInstance = (el) => (el ? bootstrap.Modal.getOrCreateInstance(el) : null);

  // Botones Agregar
  document.getElementById('btn-add-link')?.addEventListener('click', () => {
    document.getElementById('linkForm')?.reset();
    const idEl = document.getElementById('linkId'); if (idEl) idEl.value = '';
    modalLink?.show();
  });

  document.getElementById('btn-add-note')?.addEventListener('click', () => {
    document.getElementById('noteForm')?.reset();
    const idEl = document.getElementById('noteId'); if (idEl) idEl.value = '';
    modalNote?.show();
  });

  document.getElementById('btn-add-task')?.addEventListener('click', () => {
    document.getElementById('taskForm')?.reset();
    const idEl = document.getElementById('taskId'); if (idEl) idEl.value = '';
    modalTask?.show();
  });

  // SUBMIT: Notas
  document.getElementById('noteForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('noteId')?.value || '';
    const title = (document.getElementById('noteTitle')?.value || '').trim();
    const body = (document.getElementById('noteContent')?.value || '').trim();

    try {
      const method = id ? 'PUT' : 'POST';
      const endpoint = id ? `/extras/notes/${id}` : '/extras/notes';
      const res = await authedFetch(endpoint, {
        method,
        body: JSON.stringify({ title, content: body })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Error inesperado');
      getModalInstance(noteModalEl)?.hide();
      showSuccess('Nota guardada correctamente');
      await loadNotes();
    } catch (err) {
      showError('Error al guardar nota: ' + err.message);
    }
  });

  // SUBMIT: Tareas
  document.getElementById('taskForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('taskId')?.value || '';
    const task = (document.getElementById('taskContent')?.value || '').trim();
    try {
      const method = id ? 'PUT' : 'POST';
      const endpoint = id ? `/extras/tasks/${id}` : '/extras/tasks';
      const res = await authedFetch(endpoint, {
        method,
        body: JSON.stringify({ task })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Error inesperado');
      getModalInstance(taskModalEl)?.hide();
      showSuccess('Tarea guardada correctamente');
      await loadTasks();
    } catch (err) {
      showError('Error al guardar tarea: ' + err.message);
    }
  });

  // SUBMIT: Links
  document.getElementById('linkForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('linkId')?.value || '';
    const title = (document.getElementById('linkTitle')?.value || '').trim();
    const url = (document.getElementById('linkURL')?.value || '').trim();
    const description = (document.getElementById('linkDescription')?.value || '').trim();

    try {
      const method = id ? 'PUT' : 'POST';
      const endpoint = id ? `/extras/links/${id}` : '/extras/links';
      const res = await authedFetch(endpoint, {
        method,
        body: JSON.stringify({ title, url, description })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Error inesperado');
      getModalInstance(linkModalEl)?.hide();
      showSuccess('Link guardado correctamente');
      await loadLinks();
    } catch (err) {
      showError('Error al guardar link: ' + err.message);
    }
  });

  // Cargar datos
  await loadLinks();
  await loadNotes();
  await loadTasks();

  // --------- Loaders ---------
  async function loadLinks() {
    try {
      const res = await authedFetch('/extras/links');
      const json = await res.json();
      const data = Array.isArray(json.data) ? json.data : [];
      const list = document.getElementById('linksList');
      if (!list) return;
      list.innerHTML = '';

      data.forEach(link => {
        const li = document.createElement('li');
        li.className = 'list-group-item bg-dark text-light border-secondary d-flex justify-content-between align-items-start flex-column flex-md-row gap-2';

        li.innerHTML = `
          <div class="me-auto">
            <a href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer" class="text-decoration-none text-warning fw-semibold">
              ${escapeHtml(link.title)}
            </a>
            <p class="mb-0 small text-secondary white-space-pre-line">${escapeHtml(link.description || '')}</p>
          </div>
          <div class="d-flex gap-2">
            <button class="btn btn-sm btn-outline-warning btn-edit">
              <i class="bi bi-pencil-square"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger btn-delete">
              <i class="bi bi-trash-fill"></i>
            </button>
          </div>
        `;

        li.querySelector('.btn-edit')?.addEventListener('click', () => {
          document.getElementById('linkId').value = link.id;
          document.getElementById('linkTitle').value = link.title || '';
          document.getElementById('linkURL').value = link.url || '';
          document.getElementById('linkDescription').value = link.description || '';
          getModalInstance(linkModalEl)?.show();
        });

        li.querySelector('.btn-delete')?.addEventListener('click', async () => {
          const result = await showConfirm({ text: '¿Eliminar este link?' });
          if (!result.isConfirmed) return;
          try {
            const res = await authedFetch(`/extras/links/${link.id}`, { method: 'DELETE' });
            const j = await res.json();
            if (!j.success) throw new Error(j.error || 'No se pudo eliminar');
            showSuccess('Link eliminado');
            await loadLinks();
          } catch (err) {
            showError('Error al eliminar link: ' + err.message);
          }
        });

        list.appendChild(li);
      });
    } catch (err) {
      showError('Error al cargar links: ' + err.message);
    }
  }

  async function loadNotes() {
    try {
      const res = await authedFetch('/extras/notes');
      const json = await res.json();
      const data = Array.isArray(json.data) ? json.data : [];
      const container = document.getElementById('notesList');
      if (!container) return;
      container.innerHTML = '';

      data.forEach(note => {
        const div = document.createElement('div');
        div.className = 'bg-dark text-light border border-secondary rounded p-3';
        div.innerHTML = `
          <div class="d-flex justify-content-between align-items-start">
            <div>
              <h6 class="mb-1">${escapeHtml(note.title)}</h6>
              <p class="mb-0 small">${escapeHtml(note.content)}</p>
            </div>
            <div class="d-flex gap-2">
              <button class="btn btn-sm btn-outline-info btn-edit"><i class="bi bi-pencil-square"></i></button>
              <button class="btn btn-sm btn-outline-danger btn-delete"><i class="bi bi-trash"></i></button>
            </div>
          </div>
        `;

        div.querySelector('.btn-edit')?.addEventListener('click', () => {
          document.getElementById('noteId').value = note.id || '';
          document.getElementById('noteTitle').value = note.title || '';
          document.getElementById('noteContent').value = note.content || '';
          getModalInstance(noteModalEl)?.show();
        });

        div.querySelector('.btn-delete')?.addEventListener('click', async () => {
          const result = await showConfirm({ text: '¿Eliminar esta nota?' });
          if (!result.isConfirmed) return;
          try {
            const res = await authedFetch(`/extras/notes/${note.id}`, { method: 'DELETE' });
            const j = await res.json();
            if (!j.success) throw new Error(j.error || 'No se pudo eliminar');
            showSuccess('Nota eliminada');
            await loadNotes();
          } catch (err) {
            showError('Error al eliminar nota: ' + err.message);
          }
        });

        container.appendChild(div);
      });
    } catch (err) {
      showError('Error al cargar notas: ' + err.message);
    }
  }

  async function loadTasks() {
    try {
      const res = await authedFetch('/extras/tasks');
      const json = await res.json();
      const data = Array.isArray(json.data) ? json.data : [];
      const list = document.getElementById('taskList');
      if (!list) return;
      list.innerHTML = '';

      data.forEach(task => {
        const li = document.createElement('li');
        li.className = 'list-group-item bg-dark text-light border-secondary d-flex justify-content-between align-items-center';
        li.innerHTML = `
          <div class="form-check">
            <input class="form-check-input" type="checkbox" ${task.completed ? 'checked' : ''} id="chk-${task.id}">
            <label class="form-check-label ${task.completed ? 'text-decoration-line-through' : ''}" for="chk-${task.id}">
              ${escapeHtml(task.task)}
            </label>
          </div>
          <div class="d-flex gap-2">
            <button class="btn btn-sm btn-outline-info btn-edit"><i class="bi bi-pencil-square"></i></button>
            <button class="btn btn-sm btn-outline-danger btn-delete"><i class="bi bi-trash"></i></button>
          </div>
        `;

        li.querySelector('input[type="checkbox"]')?.addEventListener('change', async (e) => {
          const completed = e.target.checked;
          try {
            await authedFetch(`/extras/tasks/${task.id}`, {
              method: 'PUT',
              body: JSON.stringify({ task: task.task, completed })
            });
            await loadTasks();
          } catch (err) {
            showError('Error actualizando tarea: ' + err.message);
          }
        });

        li.querySelector('.btn-edit')?.addEventListener('click', () => {
          document.getElementById('taskId').value = task.id || '';
          document.getElementById('taskContent').value = task.task || '';
          getModalInstance(taskModalEl)?.show();
        });

        li.querySelector('.btn-delete')?.addEventListener('click', async () => {
          const result = await showConfirm({ text: '¿Eliminar esta tarea?' });
          if (!result.isConfirmed) return;
          try {
            const res = await authedFetch(`/extras/tasks/${task.id}`, { method: 'DELETE' });
            const j = await res.json();
            if (!j.success) throw new Error(j.error || 'No se pudo eliminar');
            showSuccess('Tarea eliminado');
            await loadTasks();
          } catch (err) {
            showError('Error al eliminar tarea: ' + err.message);
          }
        });

        list.appendChild(li);
      });
    } catch (err) {
      showError('Error al cargar tareas: ' + err.message);
    }
  }

  // Helpers
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderLinkModal() {
    return `
    <div class="modal fade" id="linkModal" tabindex="-1">
      <div class="modal-dialog">
        <form class="modal-content bg-dark text-white border border-secondary rounded" id="linkForm">
          <div class="modal-header border-bottom border-secondary">
            <h5 class="modal-title">Link de interés</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="linkId" />
            <div class="mb-3">
              <label for="linkTitle" class="form-label">Título</label>
              <input type="text" class="form-control" id="linkTitle" required />
            </div>
            <div class="mb-3">
              <label for="linkURL" class="form-label">URL</label>
              <input type="url" class="form-control" id="linkURL" required />
            </div>
            <div class="mb-3">
              <label for="linkDescription" class="form-label">Descripción</label>
              <textarea class="form-control" id="linkDescription" rows="2"></textarea>
            </div>
          </div>
          <div class="modal-footer border-top border-secondary">
            <button type="submit" class="btn btn-success">Guardar</button>
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
          </div>
        </form>
      </div>
    </div>`;
  }

  function renderNoteModal() {
    return `
    <div class="modal fade" id="noteModal" tabindex="-1">
      <div class="modal-dialog">
        <form class="modal-content bg-dark text-white border border-secondary rounded" id="noteForm">
          <div class="modal-header border-bottom border-secondary">
            <h5 class="modal-title">Nota</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="noteId" />
            <div class="mb-3">
              <label for="noteTitle" class="form-label">Título</label>
              <input type="text" class="form-control" id="noteTitle" required />
            </div>
            <div class="mb-3">
              <label for="noteContent" class="form-label">Detalle</label>
              <textarea class="form-control" id="noteContent" rows="4" required></textarea>
            </div>
          </div>
          <div class="modal-footer border-top border-secondary">
            <button type="submit" class="btn btn-success">Guardar</button>
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
          </div>
        </form>
      </div>
    </div>`;
  }

  function renderTaskModal() {
    return `
    <div class="modal fade" id="taskModal" tabindex="-1">
      <div class="modal-dialog">
        <form class="modal-content bg-dark text-white border border-secondary rounded" id="taskForm">
          <div class="modal-header border-bottom border-secondary">
            <h5 class="modal-title">Pendiente</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="taskId" />
            <div class="mb-3">
              <label for="taskContent" class="form-label">Tarea</label>
              <input type="text" class="form-control" id="taskContent" required />
            </div>
          </div>
          <div class="modal-footer border-top border-secondary">
            <button type="submit" class="btn btn-success">Guardar</button>
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
          </div>
        </form>
      </div>
    </div>`;
  }
}
