import express from 'express';
import { getDraftData } from './draftService.js';
import { isValidPosition } from './utils/helpers.js';

const router = express.Router();

router.get('/:leagueId', async (req, res) => {
  try {
    const { leagueId } = req.params;
    let { position = 'TODAS', byeCondition, idExpert } = req.query;

    // Validación de posición
    if (!isValidPosition(position)) {
      return res.status(400).json({ error: `Parámetro 'position' inválido: '${position}'` });
    }

    const data = await getDraftData(leagueId, {
      position,
      byeCondition: isNaN(Number(byeCondition)) ? 0 : Number(byeCondition),
      idExpert: isNaN(Number(idExpert)) ? 3701 : Number(idExpert)
    });

    res.json(data);
  } catch (error) {
    console.error('Error en /draft/:leagueId', error);
    res.status(500).json({ error: error.message || 'Error interno del servidor' });
  }
});

export default router;
