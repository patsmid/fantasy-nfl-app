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

      case 'manual': {
        const expertId = req.query.expert_id;
        if (!expertId) {
          return res.status(400).json({ error: 'Debe indicar ?expert_id=<uuid>' });
        }

        const { data, error } = await supabase
          .from('manual_rankings')
          .select(`
            id,
            rank,
            tier,
            players:players(*),
            expert:experts(experto, source)
          `)
          .eq('expert_id', expertId)
          .order('rank', { ascending: true });

        if (error) throw error;

        return res.json({
          source: 'manual',
          expert: data.length ? data[0].expert : null,
          published: new Date().toISOString(),
          players: data.map(r => ({
            ...r.players,
            rank: r.rank,
            tier: r.tier
          }))
        });
      }

      default:
        return res.status(400).json({ error: `Ranking source "${source}" no soportado` });
    }

    res.json(rankings);
  } catch (err) {
    console.error(`❌ Error en /rankings/${req.params.source}:`, err.message);
    res.status(500).json({ error: 'Error al obtener rankings' });
  }
});

// POST - Crear ranking manual
router.post('/manual', async (req, res) => {
  const { expert_id, sleeper_player_id, rank, tier } = req.body;

  const { data, error } = await supabase
    .from('manual_rankings')
    .insert([{ expert_id, sleeper_player_id, rank, tier }])
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, data });
});

// PUT - Editar ranking manual
router.put('/manual/:id', async (req, res) => {
  const { id } = req.params;
  const { rank, tier } = req.body;

  const { data, error } = await supabase
    .from('manual_rankings')
    .update({ rank, tier, updated_at: new Date() })
    .eq('id', id)
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, data });
});

// DELETE - Borrar ranking manual
router.delete('/manual/:id', async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase
    .from('manual_rankings')
    .delete()
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

export default router;
