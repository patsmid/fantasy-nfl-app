import express from 'express';
import { fetchAndStoreProjections, getWeeklyProjections, getTotalProjectionsDB, getPlayerRawStats } from './lib/projectionsService.js';

const router = express.Router();

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
    console.error('❌ Error en /api/projections:', err);
    res.status(500).json({ error: 'Error al obtener proyecciones' });
  }
});

router.post('/update', async (req, res) => {
  try {
    const { fromWeek = 1, toWeek = 18 } = req.body;

    if (fromWeek > toWeek) {
      return res.status(400).json({ error: '"fromWeek" no puede ser mayor que "toWeek"' });
    }

    console.log(`🔄 Actualizando proyecciones de la semana ${fromWeek} a ${toWeek}`);

    const result = await fetchAndStoreProjections(fromWeek, toWeek);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Error al actualizar proyecciones:', error.message || error);
    res.status(500).json({ error: 'Error al actualizar proyecciones' });
  }
});

router.get('/:playerId', async (req, res) => {
  const { playerId } = req.params;
  const { leagueId } = req.query;

  try {
    const stats = await getPlayerRawStats(playerId, leagueId);
    res.json(stats);
  } catch (err) {
    console.error(`❌ Error al obtener stats del jugador ${playerId}:`, err.message || err);
    res.status(500).json({ error: 'Error al obtener estadísticas del jugador' });
  }
});


export default router;
