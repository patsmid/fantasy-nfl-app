import express from 'express';
import { fetchAndStoreProjections, getWeeklyProjections, getTotalProjections } from './lib/projectionsService.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const { season, week } = req.query;

  if (!season) {
    return res.status(400).json({ error: 'Falta el parámetro "season"' });
  }

  try {
    const data = week
      ? await getWeeklyProjections(season, parseInt(week))
      : await getTotalProjections(season);

    res.json(data);
  } catch (err) {
    console.error('❌ Error en /api/projections:', err);
    res.status(500).json({ error: 'Error al obtener proyecciones' });
  }
});

router.post('/update', async (req, res) => {
  try {
    const result = await fetchAndStoreProjections();
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Error al actualizar proyecciones:', error.message);
    res.status(500).json({ error: 'Error al actualizar proyecciones' });
  }
});

export default router;
