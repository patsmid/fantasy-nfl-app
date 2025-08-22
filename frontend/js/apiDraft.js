// frontend/src/apiDraft.js
import { fetchWithTimeout } from '../components/utils.js';
import { getAccessTokenFromClient } from '../components/authHelpers.js';

const API_BASE = 'https://fantasy-nfl-backend.onrender.com';

/**
 * fetchDraftData -> llama a GET /manual/draft/:league_id
 * Retorna: { players: [...], params: {...}, coach?: {...} }
 */
export async function fetchDraftData(league_id, position = 'TODAS', byeCondition = 0, idExpert = '3701', sleeperADP = false) {
  if (!league_id) throw new Error('fetchDraftData: league_id requerido');

  const token = await getAccessTokenFromClient().catch(() => null);
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };

  const qs = new URLSearchParams({
    position: String(position ?? 'TODAS'),
    byeCondition: String(Number(byeCondition) || 0),
    idExpert: String(idExpert ?? '3701'),
    // si tu ruta acepta sleeperADP query param, lo anexamos
    sleeperADP: String(Boolean(sleeperADP))
  });

  const url = `${API_BASE}/manual/draft/${encodeURIComponent(String(league_id))}?${qs.toString()}`;

  const body = await fetchWithTimeout(url, { headers });
  if (!body) throw new Error('fetchDraftData: respuesta vacía');
  if (body?.error) throw new Error(body.error);

  // Normalizamos: puede venir en body.players o body.data
  const players = body?.players ?? body?.data ?? body?.data?.players ?? [];
  const params  = body?.params ?? body?.meta ?? {};
  const coach   = body?.coach ?? null;
  return { players, params, coach };
}
