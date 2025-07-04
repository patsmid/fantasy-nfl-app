const API_BASE = 'https://fantasy-nfl-backend.onrender.com';

export async function fetchPlayers() {
  const res = await fetch(`${API_BASE}/players`);
  const json = await res.json();
  return json.data;
}

export async function updatePlayers() {
  const res = await fetch(`${API_BASE}/update-players`);
  const json = await res.json();
  if (json.success) {
    alert(`Jugadores actualizados: ${json.message}`);
  } else {
    alert(`Error al actualizar: ${json.error}`);
  }
}

// --- Configuración ---
export async function fetchConfig() {
  const res = await fetch(`${API_BASE}/config`);
  if (!res.ok) throw new Error('Error al obtener configuración');
  return await res.json();
}

export async function updateConfig(id, newValue) {
  const res = await fetch(`${API_BASE}/config/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: newValue })
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Error al actualizar configuración');
  return json;
}

export async function fetchLeagues() {
  const res = await fetch(`${API_BASE}/leagues`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function updateLeagues() {
  const res = await fetch(`${API_BASE}/update-leagues`);
  const json = await res.json();
  if (json.success) {
    alert(`Ligas actualizadas: ${json.message}`);
  } else {
    alert(`Error al actualizar ligas: ${json.error}`);
  }
}

export async function updateLeaguesDynasty(id, dynasty) {
  const res = await fetch(`${API_BASE}/leagues/${id}/dynasty`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dynasty })
  });

  const json = await res.json();
  if (!json.success) throw new Error(json.error);
}

//EXPERTOS
export async function fetchExperts() {
  const res = await fetch(`${API_BASE}/experts`);
  const json = await res.json();
  return json.data;
}

export async function createExpert(data) {
  const res = await fetch(`${API_BASE}/experts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
}

export async function updateExpert(id, data) {
  const res = await fetch(`${API_BASE}/experts/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
}

export async function deleteExpert(id) {
  const res = await fetch(`${API_BASE}/experts/${id}`, {
    method: 'DELETE'
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
}
