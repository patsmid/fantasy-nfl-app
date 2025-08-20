import { fetchWithTimeout } from '../components/utils.js';

const API_BASE = 'https://fantasy-nfl-backend.onrender.com';

// 🔹 Helper para peticiones
async function apiFetch(endpoint, options = {}) {
  const res = await fetchWithTimeout(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const msg = (body && body.error) || res.statusText || 'Error en la petición';
    throw new Error(msg);
  }

  return body; // siempre retornamos el body completo
}

/* =============================
   📌 Ligas Manuales
============================= */

// obtener todas las ligas manuales por usuario (o todas si user_id=null)
export async function fetchManualLeaguesByUser(user_id = null, accessToken = null) {
  const endpoint = user_id
    ? `/manual/leagues/user/${user_id}`
    : `/manual/leagues`;

  const headers = {};
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const body = await apiFetch(endpoint, { headers });
  return body?.data || [];
}

// insertar o actualizar liga manual
export async function insertManualLeague(payload) {
  const body = await apiFetch(`/manual/leagues`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return body?.data;
}

// eliminar liga manual
export async function deleteManualLeague(league_id) {
  const body = await apiFetch(`/manual/leagues/${league_id}`, {
    method: 'DELETE'
  });
  return body?.success ?? true; // si no manda nada, devolvemos true
}

// asignar/desasignar usuario a liga
export async function setLeagueUser(league_id, user_id) {
  const body = await apiFetch(`/manual/leagues/${league_id}/user`, {
    method: 'PATCH',
    body: JSON.stringify({ user_id })
  });
  return body?.success ?? true;
}
