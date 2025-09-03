// routes/lineupRouter.js
import express from 'express';
import { getLineupData, getWaiversData } from './lib/lineupService.js';

const router = express.Router();

// === Alineación óptima ===
router.get('/:leagueId', async (req, res) => {
  try {
    const { leagueId } = req.params;
    const { idExpert = null, position = 'TODAS', week = '0' } = req.query;

    const lineup = await getLineupData(leagueId, {
      idExpert,
      position,
    });

    return res.json({
      success: true,
      data: {
        starters: lineup.starters || [],
        bench: lineup.bench || [],
        meta: lineup.meta || {},
      },
    });
  } catch (error) {
    console.error('Error al obtener alineación:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// === Waivers ===
router.get('/:leagueId/waivers', async (req, res) => {
  try {
    const { leagueId } = req.params;
    const { idExpert = null, position = 'TODAS', week = '1' } = req.query;

    // Normalizar tipos
    // const idExpertNum = isNaN(Number(idExpert)) ? idExpert : Number(idExpert);
    const weekNum = isNaN(Number(week)) ? 1 : Number(week);

    const waivers = await getWaiversData(leagueId, {
      idExpert: idExpert,
      position,
      week: weekNum,
    });

    if (!waivers || waivers.success === false) {
      return res.status(500).json({
        success: false,
        error: waivers?.error || 'Error al obtener waivers',
      });
    }

    return res.json({
      success: true,
      data: {
        freeAgents: waivers.freeAgents || [],
        meta: waivers.meta || {},
      },
    });
  } catch (error) {
    console.error('Error al obtener waivers:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
