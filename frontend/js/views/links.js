export default async function renderLinksView() {
  const content = document.getElementById('content-container');
  content.innerHTML = `
    <div class="card border-0 shadow-sm rounded flock-card">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <h4 class="m-0 d-flex align-items-center gap-2">
            <i class="bi bi-bookmarks-fill text-warning"></i> Links de interés
          </h4>
          <button class="btn btn-sm btn-primary" id="btn-add-link">
            <i class="bi bi-plus-circle me-1"></i> Agregar
          </button>
        </div>

        <ul class="list-group list-group-flush" id="linksList">
          <!-- Aquí se insertarán los links -->
        </ul>
      </div>
    </div>

    <!-- Modal -->
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
    </div>
  `;

  const modalEl = document.getElementById('linkModal');
  const modal = new bootstrap.Modal(modalEl);

  document.getElementById('btn-add-link').addEventListener('click', () => {
    document.getElementById('linkForm').reset();
    document.getElementById('linkId').value = '';
    modal.show();
  });

  document.getElementById('linkForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('linkId').value;
    const title = document.getElementById('linkTitle').value.trim();
    const url = document.getElementById('linkURL').value.trim();
    const description = document.getElementById('linkDescription').value.trim();

    try {
      const method = id ? 'PUT' : 'POST';
      const endpoint = id ? `/links/${id}` : '/links';
      const res = await fetch(`https://fantasy-nfl-backend.onrender.com${endpoint}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, url, description }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      modal.hide();
      await loadLinks();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });

  await loadLinks();
}

async function loadLinks() {
  const res = await fetch('https://fantasy-nfl-backend.onrender.com/links');
  const json = await res.json();
  const list = document.getElementById('linksList');
  list.innerHTML = '';

  json.data.forEach(link => {
    const li = document.createElement('li');
    li.className = 'list-group-item bg-dark text-light border-secondary d-flex justify-content-between align-items-start flex-column flex-md-row gap-2';

    li.innerHTML = `
      <div class="me-auto">
        <a href="${link.url}" target="_blank" class="text-decoration-none text-warning fw-semibold">
          ${link.title}
        </a>
        <p class="mb-0 small text-secondary">${link.description || ''}</p>
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

    li.querySelector('.btn-edit').addEventListener('click', () => {
      document.getElementById('linkId').value = link.id;
      document.getElementById('linkTitle').value = link.title;
      document.getElementById('linkURL').value = link.url;
      document.getElementById('linkDescription').value = link.description || '';
      const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('linkModal'));
      modal.show();
    });

    li.querySelector('.btn-delete').addEventListener('click', async () => {
      if (confirm('¿Seguro que deseas eliminar este link?')) {
        try {
          const res = await fetch(`https://fantasy-nfl-backend.onrender.com/links/${link.id}`, {
            method: 'DELETE'
          });
          const json = await res.json();
          if (!json.success) throw new Error(json.error);
          await loadLinks();
        } catch (err) {
          alert('Error al eliminar: ' + err.message);
        }
      }
    });

    list.appendChild(li);
  });
}
