// ===============================
// FRONTEND - VISTA COMPLETA "extras"
// ===============================

import { showSuccess, showError, showConfirm } from '../../components/alerts.js';

export default async function renderExtrasView() {
  const content = document.getElementById('content-container');
  content.innerHTML = `
    <div class="row g-4">
      <!-- Links -->
      <div class="col-12 col-md-6">
        <div class="card border-0 shadow-sm rounded flock-card">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center mb-4">
              <h5 class="m-0 d-flex align-items-center gap-2">
                <i class="bi bi-bookmarks-fill text-warning"></i> Links de interés
              </h5>
              <button class="btn btn-sm btn-primary" id="btn-add-link">
                <i class="bi bi-plus-circle me-1"></i> Agregar
              </button>
            </div>
            <ul class="list-group list-group-flush" id="linksList"></ul>
          </div>
        </div>
      </div>

      <!-- Notas -->
      <div class="col-12 col-md-6">
        <div class="card border-0 shadow-sm rounded flock-card">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center mb-4">
              <h5 class="m-0 d-flex align-items-center gap-2">
                <i class="bi bi-journal-text text-info"></i> Notas
              </h5>
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
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center mb-4">
              <h5 class="m-0 d-flex align-items-center gap-2">
                <i class="bi bi-check2-square text-success"></i> Pendientes
              </h5>
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

  const modalLink = new bootstrap.Modal('#linkModal');
  const modalNote = new bootstrap.Modal('#noteModal');
  const modalTask = new bootstrap.Modal('#taskModal');

  document.getElementById('btn-add-link').onclick = () => {
    document.getElementById('linkForm').reset();
    document.getElementById('linkId').value = '';
    modalLink.show();
  };

  document.getElementById('btn-add-note').onclick = () => {
    document.getElementById('noteForm').reset();
    document.getElementById('noteId').value = '';
    modalNote.show();
  };

  document.getElementById('btn-add-task').onclick = () => {
    document.getElementById('taskForm').reset();
    document.getElementById('taskId').value = '';
    modalTask.show();
  };

  document.getElementById('noteForm').onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('noteId').value;
    const title = document.getElementById('noteTitle').value.trim();
    const content = document.getElementById('noteContent').value.trim();
    try {
      const method = id ? 'PUT' : 'POST';
      const endpoint = id ? `/extras/notes/${id}` : '/extras/notes';
      const res = await fetch(`https://fantasy-nfl-backend.onrender.com${endpoint}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      modalNote.hide();
      showSuccess('Nota guardada correctamente');
      await loadNotes();
    } catch (err) {
      showError('Error al guardar nota: ' + err.message);
    }
  };

  document.getElementById('taskForm').onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('taskId').value;
    const task = document.getElementById('taskContent').value.trim();
    try {
      const method = id ? 'PUT' : 'POST';
      const endpoint = id ? `/extras/tasks/${id}` : '/extras/tasks';
      const res = await fetch(`https://fantasy-nfl-backend.onrender.com${endpoint}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      modalTask.hide();
      showSuccess('Tarea guardada correctamente');
      await loadTasks();
    } catch (err) {
      showError('Error al guardar tarea: ' + err.message);
    }
  };

  await loadLinks();
  await loadNotes();
  await loadTasks();
}

async function loadNotes() {
  const res = await fetch('https://fantasy-nfl-backend.onrender.com/extras/notes');
  const json = await res.json();
  const container = document.getElementById('notesList');
  container.innerHTML = '';
  json.data.forEach(note => {
    const div = document.createElement('div');
    div.className = 'bg-dark text-light border border-secondary rounded p-3';
    div.innerHTML = `
      <div class="d-flex justify-content-between align-items-start">
        <div>
          <h6 class="mb-1">${note.title}</h6>
          <p class="mb-0 small">${note.content}</p>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-outline-info btn-edit"><i class="bi bi-pencil-square"></i></button>
          <button class="btn btn-sm btn-outline-danger btn-delete"><i class="bi bi-trash"></i></button>
        </div>
      </div>
    `;
    div.querySelector('.btn-edit').onclick = () => {
      document.getElementById('noteId').value = note.id;
      document.getElementById('noteTitle').value = note.title;
      document.getElementById('noteContent').value = note.content;
      bootstrap.Modal.getOrCreateInstance('#noteModal').show();
    };
    div.querySelector('.btn-delete').onclick = async () => {
      const result = await showConfirm({ text: '¿Eliminar esta nota?' });
      if (result.isConfirmed) {
        const res = await fetch(`https://fantasy-nfl-backend.onrender.com/extras/notes/${note.id}`, { method: 'DELETE' });
        const json = await res.json();
        if (json.success) {
          showSuccess('Nota eliminada');
          await loadNotes();
        } else {
          showError('Error al eliminar nota');
        }
      }
    };
    container.appendChild(div);
  });
}

async function loadTasks() {
  const res = await fetch('https://fantasy-nfl-backend.onrender.com/extras/tasks');
  const json = await res.json();
  const list = document.getElementById('taskList');
  list.innerHTML = '';
  json.data.forEach(task => {
    const li = document.createElement('li');
    li.className = 'list-group-item bg-dark text-light border-secondary d-flex justify-content-between align-items-center';
    li.innerHTML = `
      <div class="form-check">
        <input class="form-check-input" type="checkbox" ${task.completed ? 'checked' : ''}>
        <label class="form-check-label ${task.completed ? 'text-decoration-line-through' : ''}">
          ${task.task}
        </label>
      </div>
      <div class="d-flex gap-2">
        <button class="btn btn-sm btn-outline-info btn-edit"><i class="bi bi-pencil-square"></i></button>
        <button class="btn btn-sm btn-outline-danger btn-delete"><i class="bi bi-trash"></i></button>
      </div>
    `;
    li.querySelector('input').onchange = async (e) => {
      const completed = e.target.checked;
      await fetch(`https://fantasy-nfl-backend.onrender.com/extras/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: task.task, completed })
      });
      await loadTasks();
    };
    li.querySelector('.btn-edit').onclick = () => {
      document.getElementById('taskId').value = task.id;
      document.getElementById('taskContent').value = task.task;
      bootstrap.Modal.getOrCreateInstance('#taskModal').show();
    };
    li.querySelector('.btn-delete').onclick = async () => {
      const result = await showConfirm({ text: '¿Eliminar esta tarea?' });
      if (result.isConfirmed) {
        const res = await fetch(`https://fantasy-nfl-backend.onrender.com/extras/tasks/${task.id}`, { method: 'DELETE' });
        const json = await res.json();
        if (json.success) {
          showSuccess('Tarea eliminada');
          await loadTasks();
        } else {
          showError('Error al eliminar tarea');
        }
      }
    };
    list.appendChild(li);
  });
}

// Modales auxiliares
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
