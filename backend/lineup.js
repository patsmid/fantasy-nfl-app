// routes/lineupRouter.js
import express from 'express';
import { getLineupData } from './lib/lineupService.js';

const router = express.Router();

router.get('/:leagueId', async (req, res) => {
  try {
    const { leagueId } = req.params;
    const { idExpert = '3701', position = 'TODAS' } = req.query;

    const lineup = await getLineupData(leagueId, {
      idExpert: idExpert,
      position
    });

    res.json({
      success: true,
      data: {
        starters: lineup.starters || [],
        bench: lineup.bench || [],
        meta: lineup.meta || {}
      }
    });
  } catch (error) {
    console.error('Error al obtener alineación:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
