import express from 'express';
import { supabase } from './supabaseClient.js';
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
            players:players(full_name, position, team, player_id),
            expert:experts(experto, source)
          `)
          .eq('expert_id', expertId)
          .order('rank', { ascending: true });

        if (error) throw error;

        return res.json({
          source: 'manual',
          expert: data.length ? data[0].expert : null,
          players: data.map(r => ({
            id: r.id,
            player_id: r.players.player_id,
            full_name: r.players.full_name,
            position: r.players.position,
            team: r.players.team,
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
// POST - Crear ranking manual
router.post('/manual', async (req, res) => {
  let { expert_id, sleeper_player_id, rank, tier } = req.body;

  // Si rank es null o undefined, asignamos 0
  rank = rank ?? 0;
  tier = tier ?? 0;

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

// GET - Jugadores pendientes de rankear para un experto
// rankings.js
router.get('/manual/pending', async (req, res) => {
  try {
    const expertId = req.query.expert_id;
    const positions = (req.query.positions || 'WR,RB,TE,QB').split(',');
    const search = req.query.search?.value || '';

    const start = parseInt(req.query.start) || 0;
    const length = parseInt(req.query.length) || 50;

    if (!expertId) return res.status(400).json({ error: 'Debe indicar expert_id' });

    // 1️⃣ Obtener todos los player_ids ya rankeados por este experto
    const { data: ranked, error: errRanked } = await supabase
      .from('manual_rankings')
      .select('sleeper_player_id')
      .eq('expert_id', expertId);

    if (errRanked) throw errRanked;
    const rankedIds = ranked.map(r => r.sleeper_player_id);

    // 2️⃣ Obtener jugadores pendientes (filtrando posiciones ofensivas y buscando)
    let query = supabase.from('players')
      .select('*', { count: 'exact' })
      .not('player_id', 'in', `(${rankedIds.map(id => `'${id}'`).join(',')})`)
      .in('position', positions);

    if (search) {
      query = query.or(`full_name.ilike.%${search}%,position.ilike.%${search}%,team.ilike.%${search}%`);
    }

    query = query.order('full_name', { ascending: true })
                 .range(start, start + length - 1);

    const { data, count, error } = await query;
    if (error) throw error;

    const processed = data.map(p => ({
      player_id: p.player_id,
      full_name: p.full_name,
      position: p.position,
      team: p.team,
      rank: null,
      tier: null
    }));

    res.json({
      draw: parseInt(req.query.draw) || 1,
      recordsTotal: count,
      recordsFiltered: count,
      players: processed
    });
  } catch (err) {
    console.error('❌ Error en /manual/pending:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
