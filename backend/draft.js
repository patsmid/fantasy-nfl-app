import express from 'express';
import { getDraftData } from './draftService.js';

const router = express.Router();

router.get('/:leagueId', async (req, res) => {
  try {
    const { leagueId } = req.params;
    if (!leagueId) return res.status(400).json({ error: 'Falta leagueId' });

    const data = await getDraftData(leagueId);
    res.json(data);
  } catch (error) {
    console.error('Error en /draft/:leagueId', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
