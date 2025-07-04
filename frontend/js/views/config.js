document.addEventListener("DOMContentLoaded", () => {
  const table = new DataTable("#config-table", {
    ajax: {
      url: "/config",
      dataSrc: "data"
    },
    columns: [
      { data: "key", title: "Clave" },
      { data: "value", title: "Valor" },
      {
        data: null,
        title: "Acciones",
        render: (data, type, row) => `
          <button class="btn btn-sm btn-primary edit-btn" data-id="${row.id}">✏️</button>
          <button class="btn btn-sm btn-danger delete-btn" data-id="${row.id}">🗑️</button>
        `
      }
    ],
    responsive: true
  });

  const form = document.getElementById("config-form");
  const modal = new bootstrap.Modal(document.getElementById("config-modal"));

  document.getElementById("add-config-btn").addEventListener("click", () => {
    form.reset();
    form.dataset.id = "";
    modal.show();
  });

  document.querySelector("#config-table tbody").addEventListener("click", async e => {
    if (e.target.classList.contains("edit-btn")) {
      const id = e.target.dataset.id;
      const res = await fetch(`/config/${id}`);
      const { data } = await res.json();
      form.key.value = data.key;
      form.value.value = data.value;
      form.dataset.id = id;
      modal.show();
    }

    if (e.target.classList.contains("delete-btn")) {
      const id = e.target.dataset.id;
      if (confirm("¿Estás seguro de eliminar esta configuración?")) {
        await fetch(`/config/${id}`, { method: "DELETE" });
        table.ajax.reload();
      }
    }
  });

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const id = form.dataset.id;
    const method = id ? "PUT" : "POST";
    const endpoint = id ? `/config/${id}` : `/config`;
    const payload = {
      key: form.key.value,
      value: form.value.value
    };

    await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    modal.hide();
    table.ajax.reload();
  });
});
