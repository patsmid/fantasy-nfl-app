import express from 'express';
import {
  fetchAndStoreProjections,
  getWeeklyProjections,
  getTotalProjectionsDB,
  getPlayerRawStats,
  getAllPlayersProjectedTotals
} from './lib/projectionsService.js';

const router = express.Router();

// GET /api/projections?season=2025[&week=3]
router.get('/', async (req, res) => {
  const { season, week } = req.query;

  if (!season) {
    return res.status(400).json({ error: 'Falta el parámetro "season"' });
  }

  try {
    const data = week
      ? await getWeeklyProjections(season, parseInt(week))
      : await getTotalProjectionsDB(season);

    res.json(data);
  } catch (err) {
    console.error('❌ Error en GET /api/projections:', err);
    res.status(500).json({ error: 'Error al obtener proyecciones' });
  }
});

// POST /api/projections/update
router.post('/update', async (req, res) => {
  const { fromWeek = 1, toWeek = 18 } = req.body;

  if (fromWeek > toWeek) {
    return res.status(400).json({ error: '"fromWeek" no puede ser mayor que "toWeek"' });
  }

  try {
    console.log(`🔄 Actualizando proyecciones de la semana ${fromWeek} a ${toWeek}`);
    const result = await fetchAndStoreProjections(fromWeek, toWeek);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('❌ Error en POST /api/projections/update:', err.message || err);
    res.status(500).json({ error: 'Error al actualizar proyecciones' });
  }
});

// GET /api/projections/total?leagueId=xxxxx&limit=50&offset=0
router.get('/total', async (req, res) => {
  const { leagueId, limit, offset } = req.query;

  if (!leagueId) {
    return res.status(400).json({ error: 'Falta el parámetro "leagueId"' });
  }

  try {
    const data = await getAllPlayersProjectedTotals(leagueId);
    console.log('🎯 Total jugadores procesados:', data.length);

    const paginated = limit
      ? data.slice(Number(offset) || 0, (Number(offset) || 0) + Number(limit))
      : data;

    res.json({
      total: data.length,
      results: paginated,
    });
  } catch (err) {
    console.error('❌ Error en GET /api/projections/total:', err.message);
    res.status(500).json({ error: 'Error al obtener proyecciones totales' });
  }
});

// GET /api/projections/player/:playerId?leagueId=xxxxx
router.get('/player/:playerId', async (req, res) => {
  const { playerId } = req.params;
  const { leagueId } = req.query;

  try {
    const stats = await getPlayerRawStats(playerId, leagueId);
    res.json(stats);
  } catch (err) {
    console.error(`❌ Error en GET /api/projections/player/${playerId}:`, err.message || err);
    res.status(500).json({ error: 'Error al obtener estadísticas del jugador' });
  }
});

export default router;
