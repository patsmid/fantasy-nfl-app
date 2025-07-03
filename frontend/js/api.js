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
    alert(`Jugadores actualizados: ${json.updated}`);
  } else {
    alert(`Error al actualizar: ${json.error}`);
  }
}
