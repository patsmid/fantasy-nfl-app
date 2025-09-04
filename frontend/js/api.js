import { showSuccess, showError, showConfirm } from '../components/alerts.js';
import { fetchWithTimeout } from '../components/utils.js';
const API_BASE = 'https://fantasy-nfl-backend.onrender.com';

export async function fetchLineupData(leagueId, idExpert, week) {
  const url = `${API_BASE}/lineup/${leagueId}?idExpert=${idExpert}&week=${week}`;

  try {
    const res = await fetchWithTimeout(url);

    if (!res.success || !res.data) {
      throw new Error(res.error || 'Error al obtener alineación');
    }

    return res.data;
  } catch (err) {
    console.error('Error en fetchLineupData:', err);
    throw err;
  }
}

/**
 * Trae waivers / free agents de la liga y experto seleccionado
 */
export async function fetchWaiversData(leagueId, idExpert, week) {
  const url = `${API_BASE}/lineup/${leagueId}/waivers?idExpert=${idExpert}&week=${week}`;

  try {
    const res = await fetch(url, { cache: 'no-cache' });
    const data = await res.json();

    if (!data.success || !data.data) {
      throw new Error(data.error || 'Error al obtener waivers');
    }

    // data.data debería contener { freeAgents, meta }
    return data.data;
  } catch (err) {
    console.error('Error en fetchWaiversData:', err);
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

export async function fetchConsensusData(
  leagueId,
  position = 'TODAS',
  byeCondition = 0,
  sleeperADP = false
) {
  const url = `${API_BASE}/draft/${leagueId}?position=${encodeURIComponent(position)}&byeCondition=${byeCondition}&sleeperADP=${sleeperADP}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Error HTTP ${res.status}`);

    const json = await res.json();

    // Nueva API: data es un array directo
    if (!json?.data || !Array.isArray(json.data)) {
      console.error('Respuesta inesperada del servidor:', json);
      throw new Error('Formato inválido: faltan jugadores en la respuesta');
    }

    return {
      players: json.data,              // <- usar directamente json.data
      params: json.params || {},
      myDrafted: json.my_drafted || [], // <- si existe
      starterPositions: json.starterPositions || []
    };
  } catch (err) {
    console.error('Error en fetchConsensusData:', err);
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
