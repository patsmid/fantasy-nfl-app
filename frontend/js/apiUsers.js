// frontend/src/apiUsers.js
import { fetchWithTimeout } from '../components/utils.js';

const API_BASE = 'https://fantasy-nfl-backend.onrender.com';

// 🔹 Helper para peticiones
async function apiFetch(endpoint, options = {}) {
  try {
    // pequeño log opcional (desactiva en producción)
    // console.debug('[apiFetch] ', endpoint, options && options.method ? options.method : 'GET');

    const body = await fetchWithTimeout(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });

    // si la API manda un campo error
    if (body?.error) {
      throw new Error(body.error);
    }

    return body; // ya es JSON
  } catch (err) {
    // mejor mensaje para debugging
    console.error(`❌ Error en apiFetch (${endpoint}):`, (err && err.message) || err);
    throw err;
  }
}

/* =============================
   📌 Ligas Manuales
============================= */

/**
 * fetchManualLeaguesByUser
 * user_id opcional, accessToken opcional
 */
export async function fetchManualLeaguesByUser(user_id = null, accessToken = null) {
  const endpoint = user_id
    ? `/manual/leagues/user/${encodeURIComponent(String(user_id))}`
    : `/manual/leagues`;

  const headers = {};
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const body = await apiFetch(endpoint, { headers });
  return body?.data || [];
}

export async function insertManualLeague(payload, accessToken = null) {
  const headers = {};
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const body = await apiFetch(`/manual/leagues`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  return body?.data;
}

/**
 * deleteManualLeague
 * -> valida que league_id sea un entero válido antes de llamar a la API.
 * -> lanza error descriptivo si no es válido.
 */
export async function deleteManualLeague(league_id, accessToken = null) {
  // Normalizar / validar
  if (league_id === undefined || league_id === null) {
    throw new Error('deleteManualLeague: league_id es undefined/null');
  }

  // Si viene como string 'undefined' o '', detectarlo
  if (typeof league_id === 'string') {
    const trimmed = league_id.trim();
    if (trimmed === '' || trimmed.toLowerCase() === 'undefined' || trimmed.toLowerCase() === 'null') {
      throw new Error(`deleteManualLeague: league_id inválido ("${league_id}")`);
    }
    // Si es número en string (ej "123"), convertir a entero
    if (/^\d+$/.test(trimmed)) {
      league_id = Number(trimmed);
    }
  }

  // Ahora aseguramos que es un número entero finito
  if (typeof league_id !== 'number' || !Number.isFinite(league_id) || !Number.isInteger(league_id)) {
    throw new Error(`deleteManualLeague: league_id debe ser entero. Valor recibido: ${JSON.stringify(league_id)}`);
  }

  const headers = {};
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  // Endpoint seguro usando encodeURIComponent aunque aquí es número
  const endpoint = `/manual/leagues/${encodeURIComponent(String(league_id))}`;

  // opcional: console.debug para verificar URL en dev
  // console.debug('[deleteManualLeague] DELETE', endpoint);

  const body = await apiFetch(endpoint, {
    method: 'DELETE',
    headers
  });

  // Aseguramos el shape de la respuesta
  if (body?.success === false) {
    // re-lanzar con info útil
    throw new Error(body.error || 'API respondió success=false al eliminar liga');
  }

  return body?.success ?? true;
}

export async function setLeagueUser(league_id, user_id) {
  // Validaciones mínimas
  if (!league_id) throw new Error('setLeagueUser: league_id requerido');
  if (!user_id) throw new Error('setLeagueUser: user_id requerido');

  const body = await apiFetch(`/manual/leagues/${encodeURIComponent(String(league_id))}/user`, {
    method: 'PATCH',
    body: JSON.stringify({ user_id })
  });
  return body?.success ?? true;
}
