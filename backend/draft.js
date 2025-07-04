import express from 'express';
import { getDraftRankings } from '../utils/fantasypros.js';
import { getSleeperADP } from '../utils/sheets.js';
import { findPlayerRank } from '../utils/helpers.js';

const router = express.Router();

router.get('/draft', async (req, res) => {
  try {
    const {
      scoring = 'PPR',
      pos = 'TODAS',
      dynasty = true,
      expertId = '1462', // predeterminado
      season = 2025,
      week = 0
    } = req.query;

    const position = pos === 'TODAS' ? 'ALL' : pos;

    const rankings = await getDraftRankings({ season, week, expertId, position, scoring, dynasty });
    const adpCurrent = await getSleeperADP(false);
    const adpPrev = await getSleeperADP(true);

    const draftData = adpCurrent.map(player => {
      const prev = adpPrev.find(p => p.player_id === player.player_id);
      const adpBefore = prev ? prev.adp : 500;

      const { rank, pos_rank, bye_week } = findPlayerRank(player.full_name, rankings);

      return {
        rank,
        name: player.full_name,
        team: player.team,
        position: player.position,
        pos_rank,
        bye_week,
        adp: player.adp,
        adp_diff: adpBefore - player.adp,
        rookie: player.rookie
      };
    });

    res.json(draftData);
  } catch (err) {
    console.error('Error generating draft:', err);
    res.status(500).json({ error: 'Error generating draft data' });
  }
});

export default router;
