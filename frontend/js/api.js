import { showSuccess, showError, showConfirm } from '../components/alerts.js';
import { fetchWithTimeout } from '../components/utils.js';
const API_BASE = 'https://fantasy-nfl-backend.onrender.com';

export async function fetchLineupData(leagueId, idExpert) {
  const url = `${API_BASE}/lineup/${leagueId}?idExpert=${idExpert}`;

  try {
    const res = await fetchWithTimeout(url);

    if (!res.success || !res.data) {
      throw new Error(res.error || 'Error al obtener alineación');
    }

    return res.data; // <-- esto contiene starters y bench
  } catch (err) {
    console.error('Error en fetchLineupData:', err);
    throw err;
  }
}

export async function fetchDraftData(
  leagueId,
  position = 'TODAS',
  byeCondition = 0,
  idExpert = 3701,
  sleeperADP = false  // nuevo parámetro
) {
  const url = `${API_BASE}/draft/${leagueId}?position=${encodeURIComponent(position)}&byeCondition=${byeCondition}&idExpert=${idExpert}&sleeperADP=${sleeperADP}`;

  try {
    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`Error HTTP ${res.status}`);
    }

    const json = await res.json();

    // Validar estructura esperada
    if (!json?.data?.players || !Array.isArray(json.data.players)) {
      console.error('Respuesta inesperada del servidor:', json);
      throw new Error('Formato inválido: faltan jugadores en la respuesta');
    }

    return {
      players: json.data.players,
      params: json.params || {}
    };
  } catch (err) {
    console.error('Error en fetchDraftData:', err);
    throw err;
  }
}

export async function fetchPlayers() {
  const res = await fetchWithTimeout(`${API_BASE}/players`);
  const json = await res.json();
  return json.data;
}

export async function updatePlayers() {
  try {
    const res = await fetch(`${API_BASE}/update-players`);
    const json = await res.json();

    if (json.success) {
      showSuccess(`Éxito: ${json.message}`);
    } else {
      showError(`Error al actualizar: ${json.error}`);
    }
  } catch (err) {
    showError(`Error de conexión: ${err.message}`);
  }
}

export async function fetchSleeperADP() {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/sleeperADP`);
    const json = await res.json();
    if (!json.data) throw new Error('No data received');
    return json.data;
  } catch (err) {
    showError(`Error al obtener ADP: ${err.message}`);
    return [];
  }
}

export async function updateSleeperADP() {
  try {
    const res = await fetch(`${API_BASE}/update-sleeper-adp`, { method: 'POST' });
    const json = await res.json();

    if (json.success) {
      showSuccess(`Éxito: ${json.message || 'ADP actualizado'}`);
    } else {
      showError(`Error al actualizar ADP: ${json.error || 'Error desconocido'}`);
    }
  } catch (err) {
    showError(`Error de conexión: ${err.message}`);
  }
}

// --- Configuración ---
export async function fetchConfig() {
  const res = await fetchWithTimeout(`${API_BASE}/config`);
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
  const res = await fetchWithTimeout(`${API_BASE}/leagues`);
  if (!res.success) throw new Error(res.error);
  return res.data;
}

export async function updateLeagues() {
	try {
		const res = await fetch(`${API_BASE}/update-leagues`);
	  const json = await res.json();

    if (json.success) {
      showSuccess(`Ligas actualizadas: ${json.message}`);
    } else {
      showError(`Error al actualizar ligas: ${json.error}`);
    }
  } catch (err) {
    showError(`Error de conexión: ${err.message}`);
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
  const res = await fetchWithTimeout(`${API_BASE}/experts`);
  return res.data;
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

export async function fetchUniqueSleeperADPValues(column) {
  try {
    const res = await fetch(`${API_BASE}/sleeperADP/unique-values?column=${encodeURIComponent(column)}`);
    const json = await res.json();
    if (json.success) return json.data;
    else throw new Error(json.error || 'Error al obtener valores únicos');
  } catch (err) {
    console.error(err);
    return [];
  }
}

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
