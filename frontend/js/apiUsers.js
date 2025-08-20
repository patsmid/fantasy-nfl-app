import { showSuccess, showError, showConfirm } from '../components/alerts.js';
import { fetchWithTimeout } from '../components/utils.js';
const API_BASE = 'https://fantasy-nfl-backend.onrender.com';

//FUNCIONES PARA USUARIOS
// 🔹 obtener todas las ligas manuales por usuario (si no pasas user_id trae todas)
export async function fetchManualLeaguesByUser(user_id = null) {
  const url = user_id ? `${API_BASE}/manual/leagues/user/${user_id}` : `${API_BASE}/leagues/user/null`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Error al obtener ligas manuales');
  const { data } = await res.json();
  return data || [];
}

// 🔹 insertar o actualizar liga manual
export async function insertManualLeague(payload) {
  const res = await fetch(`${API_BASE}/manual/leagues/insert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Error al insertar liga');
  const { data } = await res.json();
  return data;
}

// 🔹 eliminar liga manual
export async function deleteManualLeague(id) {
  const res = await fetch(`${API_BASE}/manual/leagues/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Error al eliminar liga');
  return true;
}

// 🔹 asignar/desasignar usuario a liga
export async function setLeagueUser(id, user_id) {
  const res = await fetch(`${API_BASE}/manual/leagues/${id}/user`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id })
  });
  if (!res.ok) throw new Error('Error al asignar usuario');
  return true;
}
