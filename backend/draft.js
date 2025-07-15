import express from 'express';
import { getDraftData } from './draftService.js';
import { isValidPosition } from './utils/helpers.js';

const router = express.Router();

router.get('/:leagueId', async (req, res) => {
  try {
    const { leagueId } = req.params;
    let { position = 'TODAS', byeCondition = 0, idExpert = '3701' } = req.query;

    // Permitir booleano 'true' como string
    if (position === 'true') position = true;

    // Validar solo si es un string no válido y no es 'SUPER FLEX'
    if (!isValidPosition(position) && position !== true && position !== 'SUPER FLEX') {
      return res.status(400).json({ error: `Parámetro 'position' inválido: '${position}'` });
    }

    // Si byeCondition es NaN, dejar como 0
    const byeCondParsed = isNaN(Number(byeCondition)) ? 0 : Number(byeCondition);

    const data = await getDraftData(leagueId, {
      position,
      byeCondition: byeCondParsed,
      idExpert
    });

    res.json(data);
  } catch (error) {
    console.error('❌ Error en /draft/:leagueId', error);
    res.status(500).json({ error: error.message || 'Error interno del servidor' });
  }
});

export default router;
