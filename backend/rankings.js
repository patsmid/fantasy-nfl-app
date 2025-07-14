import express from 'express';
import { getFlockRankings, getFantasyProsRankings } from './lib/rankingsService.js';

const router = express.Router();

router.get('/:source', async (req, res) => {
  const { source } = req.params;
  const dynasty = req.query.dynasty === 'true';
  const superflex = req.query.superflex === 'true';
  const expert = req.query.expert || null;

  try {
    let rankings;

    switch (source) {
      case 'flock':
        rankings = await getFlockRankings({ dynasty, superflex, expert });
        break;

      case 'fantasypros': {
        const { season, scoring, idExpert, position, week } = req.query;
        rankings = await getFantasyProsRankings({
          season,
          dynasty,
          scoring,
          idExpert,
          position,
          weekStatic: week
        });
        break;
      }

      // case 'underdog':
      //   rankings = await getUnderdogRankings({...});
      //   break;

      default:
        return res.status(400).json({ error: `Ranking source "${source}" no soportado` });
    }

    res.json(rankings);
  } catch (err) {
    console.error(`❌ Error en /rankings/${req.params.source}:`, err.message);
    res.status(500).json({ error: 'Error al obtener rankings' });
  }
});

export default router;
