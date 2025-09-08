// src/routes/playerBreakdown.js
import express from 'express';
import { getRosters } from './utils/sleeper.js';
import { getConfigValue, getPlayersData } './lib/draftUtils.js';
import { fetchLeaguesFromDB } from './leagues.js'; // helper anterior

const router = express.Router();

function chunkedMap(items, chunkSize, handler) {
  return (async () => {
    const results = [];
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      const r = await Promise.all(chunk.map(handler));
      results.push(...r);
    }
    return results;
  })();
}

router.get('/player-breakdown', async (req, res) => {
  try {
    const mainUserId = await getConfigValue('main_user_id'); // asegúrate del tipo
    if (!mainUserId) {
      return res.status(400).json({ success: false, error: 'main_user_id no configurado' });
    }

    // traer solo ligas donde bestball = false
    const leagues = await fetchLeaguesFromDB({ onlyNonBestball: true });

    const playerMap = new Map(); // playerId -> { player_id, occurrences:[], total_count, league_ids:Set }

    // Para no saturar la API de Sleeper, iterar en chunks (p. ej. 3 ligas a la vez)
    await chunkedMap(leagues, 3, async (league) => {
      try {
        const rosters = await getRosters(league.league_id);
        if (!Array.isArray(rosters)) return null;

        // Soportar 2 formas de mainUserId:
        // - Si mainUserId es el Sleeper owner_id (p. ej. '862138476953473024') -> compararlo con roster.owner_id
        // - Si mainUserId es UUID local guardado en leagues.user_id -> compararlo con league.user_id
        const userRoster = rosters.find(r => {
          if (!r) return false;
          if (String(r.owner_id) === String(mainUserId)) return true;
          if (league.user_id && String(league.user_id) === String(mainUserId)) return true;
          return false;
        });

        if (!userRoster) {
          // Si el roster del usuario no está en la liga, saltar
          return null;
        }

        // Construir set de todos los player ids del roster
        const playersSet = new Set([
          ...((userRoster.players) || []),
          ...((userRoster.starters) || []),
          ...((userRoster.reserve) || []),
          ...((userRoster.taxi) || [])
        ]);

        for (const pid of playersSet) {
          if (!pid) continue;
          const isStarter = (userRoster.starters || []).includes(pid);
          const isReserve = (userRoster.reserve || []).includes(pid);
          const isTaxi = (userRoster.taxi || []).includes(pid);
          const role = isStarter ? 'starter' : isReserve ? 'reserve' : isTaxi ? 'taxi' : 'bench';

          const existing = playerMap.get(pid) || {
            player_id: pid,
            occurrences: [],
            total_count: 0,
            league_ids: new Set()
          };

          existing.occurrences.push({
            league_id: league.league_id,
            league_name: league.name,
            roster_id: userRoster.roster_id,
            role
          });
          existing.total_count += 1;
          existing.league_ids.add(league.league_id);

          playerMap.set(pid, existing);
        }

        return null;
      } catch (err) {
        console.error(`Error procesando liga ${league.league_id}:`, err);
        return null;
      }
    });

    const playerIds = Array.from(playerMap.keys());

    // Obtener metadatos de jugadores (usa tu helper)
    let playersMetaMap = {};
    if (playerIds.length) {
      try {
        // getPlayersData se espera que reciba array de ids y devuelva { playerId: { ... } }
        playersMetaMap = await getPlayersData(playerIds);
      } catch (err) {
        console.warn('getPlayersData falló, intentaremos fallback a Sleeper API:', err.message);
        // Fallback: descargar players desde Sleeper (mapa completo) y tomar lo que necesites.
        try {
          const r = await fetch('https://api.sleeper.app/v1/players/nfl');
          if (r.ok) {
            const allPlayers = await r.json();
            playersMetaMap = {};
            for (const pid of playerIds) {
              const p = allPlayers[pid];
              if (p) playersMetaMap[pid] = {
                full_name: p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim(),
                position: p.position,
                team: p.team
              };
            }
          }
        } catch (err2) {
          console.warn('Fallback a players/nfl falló:', err2.message);
        }
      }
    }

    // Formatear salida
    const players = Array.from(playerMap.values()).map(p => ({
      player_id: p.player_id,
      name: (playersMetaMap[p.player_id] && (playersMetaMap[p.player_id].full_name || playersMetaMap[p.player_id].name)) || null,
      position: playersMetaMap[p.player_id]?.position || null,
      team: playersMetaMap[p.player_id]?.team || null,
      total_count: p.total_count, // cuantas veces aparece (cada liga cuenta como una aparición)
      leagues_count: p.league_ids.size,
      occurrences: p.occurrences
    }));

    // Orden simple: primero por en cuántas ligas aparece, luego por total_count
    players.sort((a, b) => b.leagues_count - a.leagues_count || b.total_count - a.total_count);

    return res.json({
      success: true,
      data: {
        players,
        leagues: leagues.map(l => ({ league_id: l.league_id, name: l.name }))
      }
    });

  } catch (err) {
    console.error('Error en /player-breakdown:', err);
    return res.status(500).json({ success: false, error: err.message || err });
  }
});

export default router;
