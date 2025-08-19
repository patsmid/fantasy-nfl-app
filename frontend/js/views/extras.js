import { supabase } from '../../components/supabaseClient.js'

export default async function renderExtrasView() {
  // Intentar importar los helpers de alerts; si falla, usar fallback simple
  let showSuccess, showError, showConfirm;
  try {
    const alerts = await import('../../components/alerts.js');
    showSuccess = alerts.showSuccess;
    showError = alerts.showError;
    showConfirm = alerts.showConfirm;
  } catch (err) {
    // Fallbacks simples para que la vista no rompa si no se pudo importar
    showError = (msg) => { console.error(msg); alert(msg); };
    showSuccess = (msg) => { console.log(msg); alert(msg); };
    showConfirm = async ({ text }) => {
      const ok = confirm(text || '¿Confirmar?');
      return { isConfirmed: ok };
    };
    console.warn('No se pudo importar components/alerts.js — usando fallbacks.', err);
  }

  // Validar sesión
  const { data: sessionData, error: userErr } = await supabase.auth.getUser();
  const currentUser = sessionData?.user ?? null;
  if (userErr || !currentUser) {
    console.error('Usuario no autenticado:', userErr);
    showError('No estás autenticado. Serás redirigido al login.');
    localStorage.removeItem('fantasyUser');
    localStorage.removeItem('fantasyUserId');
    window.location.href = '/login.html';
    return;
  }

  const content = document.getElementById('content-container');
  if (!content) {
    showError('No se encontró el contenedor de contenido.');
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

  // crear instancias de modal con elementos DOM (no pasar strings)
  const linkModalEl = document.getElementById('linkModal');
  const noteModalEl = document.getElementById('noteModal');
  const taskModalEl = document.getElementById('taskModal');
  const modalLink = linkModalEl ? new bootstrap.Modal(linkModalEl) : null;
  const modalNote = noteModalEl ? new bootstrap.Modal(noteModalEl) : null;
  const modalTask = taskModalEl ? new bootstrap.Modal(taskModalEl) : null;

  // Helpers para obtener instancia segura
  const getModalInstance = (el) => {
    if (!el) return null;
    return bootstrap.Modal.getOrCreateInstance(el);
  };

  // Botones "Agregar" (si existen)
  const btnAddLink = document.getElementById('btn-add-link');
  if (btnAddLink) {
    btnAddLink.addEventListener('click', () => {
      const form = document.getElementById('linkForm');
      if (form) form.reset();
      const idEl = document.getElementById('linkId');
      if (idEl) idEl.value = '';
      if (modalLink) modalLink.show();
    });
  }

  const btnAddNote = document.getElementById('btn-add-note');
  if (btnAddNote) {
    btnAddNote.addEventListener('click', () => {
      const form = document.getElementById('noteForm');
      if (form) form.reset();
      const idEl = document.getElementById('noteId');
      if (idEl) idEl.value = '';
      if (modalNote) modalNote.show();
    });
  }

  const btnAddTask = document.getElementById('btn-add-task');
  if (btnAddTask) {
    btnAddTask.addEventListener('click', () => {
      const form = document.getElementById('taskForm');
      if (form) form.reset();
      const idEl = document.getElementById('taskId');
      if (idEl) idEl.value = '';
      if (modalTask) modalTask.show();
    });
  }

  // ---------------------------
  // SUBMITS: Note, Task, Link
  // ---------------------------
  const noteForm = document.getElementById('noteForm');
  if (noteForm) {
    noteForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('noteId')?.value || '';
      const title = (document.getElementById('noteTitle')?.value || '').trim();
      const body = (document.getElementById('noteContent')?.value || '').trim();

      try {
        const method = id ? 'PUT' : 'POST';
        const endpoint = id ? `/extras/notes/${id}` : '/extras/notes';
        const res = await fetch(`https://fantasy-nfl-backend.onrender.com${endpoint}`, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, content: body })
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Status ${res.status}: ${text}`);
        }
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'Error inesperado');
        const inst = getModalInstance(noteModalEl);
        if (inst) inst.hide();
        showSuccess('Nota guardada correctamente');
        await loadNotes();
      } catch (err) {
        showError('Error al guardar nota: ' + err.message);
      }
    });
  }

  const taskForm = document.getElementById('taskForm');
  if (taskForm) {
    taskForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('taskId')?.value || '';
      const task = (document.getElementById('taskContent')?.value || '').trim();
      try {
        if (id) {
          const { data, error } = await supabase
            .from('tasks')
            .update({ task, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select();
          if (error) throw error;
        } else {
          const { data, error } = await supabase
            .from('tasks')
            .insert({ task, completed: false })
            .select();
          if (error) throw error;
        }
        getModalInstance(taskModalEl)?.hide();
        showSuccess('Tarea guardada correctamente');
        await loadTasks();
      } catch (err) {
        showError('Error al guardar tarea: ' + (err.message || err));
      }
    });
  }

  const linkForm = document.getElementById('linkForm');
  if (linkForm) {
    linkForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('linkId')?.value || '';
      const title = (document.getElementById('linkTitle')?.value || '').trim();
      const url = (document.getElementById('linkURL')?.value || '').trim();
      const description = (document.getElementById('linkDescription')?.value || '').trim();

      try {
        const method = id ? 'PUT' : 'POST';
        const endpoint = id ? `/extras/links/${id}` : '/extras/links';
        const res = await fetch(`https://fantasy-nfl-backend.onrender.com${endpoint}`, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, url, description })
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Status ${res.status}: ${text}`);
        }
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'Error inesperado');
        const inst = getModalInstance(linkModalEl);
        if (inst) inst.hide();
        showSuccess('Link guardado correctamente');
        await loadLinks();
      } catch (err) {
        showError('Error al guardar link: ' + err.message);
      }
    });
  }

  // Cargar datos
  await loadLinks();
  await loadNotes();
  await loadTasks();

  // ---------------------------
  // CARGADORES
  // ---------------------------
  async function loadLinks() {
    try {
      const res = await fetch('https://fantasy-nfl-backend.onrender.com/extras/links');
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Status ${res.status}: ${txt}`);
      }
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

        const btnEdit = li.querySelector('.btn-edit');
        const btnDelete = li.querySelector('.btn-delete');

        if (btnEdit) {
          btnEdit.onclick = () => {
            (document.getElementById('linkId') || {}).value = link.id;
            (document.getElementById('linkTitle') || {}).value = link.title || '';
            (document.getElementById('linkURL') || {}).value = link.url || '';
            (document.getElementById('linkDescription') || {}).value = link.description || '';
            const inst = getModalInstance(linkModalEl);
            if (inst) inst.show();
          };
        }

        if (btnDelete) {
          btnDelete.onclick = async () => {
            const result = await showConfirm({ text: '¿Eliminar este link?' });
            if (result.isConfirmed) {
              try {
                const res = await fetch(`https://fantasy-nfl-backend.onrender.com/extras/links/${link.id}`, { method: 'DELETE' });
                if (!res.ok) {
                  const txt = await res.text();
                  throw new Error(`Status ${res.status}: ${txt}`);
                }
                const j = await res.json();
                if (!j.success) throw new Error(j.error || 'No se pudo eliminar');
                showSuccess('Link eliminado');
                await loadLinks();
              } catch (err) {
                showError('Error al eliminar link: ' + err.message);
              }
            }
          };
        }

        list.appendChild(li);
      });
    } catch (err) {
      showError('Error al cargar links: ' + err.message);
    }
  }

  async function loadNotes() {
    try {
      const res = await fetch('https://fantasy-nfl-backend.onrender.com/extras/notes');
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Status ${res.status}: ${txt}`);
      }
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
        const btnEdit = div.querySelector('.btn-edit');
        const btnDelete = div.querySelector('.btn-delete');

        if (btnEdit) {
          btnEdit.onclick = () => {
            (document.getElementById('noteId') || {}).value = note.id || '';
            (document.getElementById('noteTitle') || {}).value = note.title || '';
            (document.getElementById('noteContent') || {}).value = note.content || '';
            const inst = getModalInstance(noteModalEl);
            if (inst) inst.show();
          };
        }

        if (btnDelete) {
          btnDelete.onclick = async () => {
            const result = await showConfirm({ text: '¿Eliminar esta nota?' });
            if (result.isConfirmed) {
              try {
                const res = await fetch(`https://fantasy-nfl-backend.onrender.com/extras/notes/${note.id}`, { method: 'DELETE' });
                if (!res.ok) {
                  const txt = await res.text();
                  throw new Error(`Status ${res.status}: ${txt}`);
                }
                const j = await res.json();
                if (!j.success) throw new Error(j.error || 'No se pudo eliminar');
                showSuccess('Nota eliminada');
                await loadNotes();
              } catch (err) {
                showError('Error al eliminar nota: ' + err.message);
              }
            }
          };
        }

        container.appendChild(div);
      });
    } catch (err) {
      showError('Error al cargar notas: ' + err.message);
    }
  }

  async function loadTasks() {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;

      const list = document.getElementById('taskList');
      if (!list) return;
      list.innerHTML = '';

      (data || []).forEach(task => {
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

        const checkbox = li.querySelector('input[type="checkbox"]');
        const btnEdit = li.querySelector('.btn-edit');
        const btnDelete = li.querySelector('.btn-delete');

        if (checkbox) {
          checkbox.onchange = async (e) => {
            const completed = e.target.checked;
            try {
              const { error } = await supabase
                .from('tasks')
                .update({ completed, updated_at: new Date().toISOString() })
                .eq('id', task.id);
              if (error) throw error;
              await loadTasks();
            } catch (err) {
              showError('Error actualizando tarea: ' + (err.message || err));
            }
          };
        }

        if (btnEdit) {
          btnEdit.onclick = () => {
            (document.getElementById('taskId') || {}).value = task.id || '';
            (document.getElementById('taskContent') || {}).value = task.task || '';
            getModalInstance(taskModalEl)?.show();
          };
        }

        if (btnDelete) {
          btnDelete.onclick = async () => {
            const result = await showConfirm({ text: '¿Eliminar esta tarea?' });
            if (result.isConfirmed) {
              try {
                const { error } = await supabase.from('tasks').delete().eq('id', task.id);
                if (error) throw error;
                showSuccess('Tarea eliminada');
                await loadTasks();
              } catch (err) {
                showError('Error al eliminar tarea: ' + (err.message || err));
              }
            }
          };
        }

        list.appendChild(li);
      });
    } catch (err) {
      showError('Error al cargar tareas: ' + (err.message || err));
    }
  }

  // ---------------------------
  // Helpers
  // ---------------------------
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Renders (ya definidas arriba)
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
