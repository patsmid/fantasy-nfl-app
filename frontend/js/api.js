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
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: newValue })
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Error al actualizar configuración');
  return json;
}
