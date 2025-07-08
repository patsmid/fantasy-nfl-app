import express from 'express';
import { fetchAndStoreProjections, getWeeklyProjections, getTotalProjectionsDB } from './lib/projectionsService.js';

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
    console.log('🔁 Iniciando actualización de proyecciones');
    const result = await fetchAndStoreProjections();
    console.log('✅ Actualización completada');
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Error al actualizar proyecciones:', error.message || error);
    res.status(500).json({ error: 'Error al actualizar proyecciones' });
  }
});

export default router;
