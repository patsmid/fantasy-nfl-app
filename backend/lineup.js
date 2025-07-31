// routes/lineupRouter.js
import express from 'express';
import { getLineupData } from './lib/lineupService.js';

const router = express.Router();

router.get('/:leagueId', async (req, res) => {
  try {
    const { leagueId } = req.params;
    const { idExpert = 3701, position = 'TODAS' } = req.query;

    const lineup = await getLineupData(leagueId, {
      idExpert: parseInt(idExpert),
      position
    });

    res.json(lineup);
  } catch (error) {
    console.error('Error al obtener alineación:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
