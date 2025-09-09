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

    const { season, scoring, idExpert, position, week } = req.query;

		switch (source) {
      case 'flock':
				let type = 'REDRAFT';
				if (week > 0) type = 'WEEKLY';
        rankings = await getFlockRankings({ dynasty, superflex, expert, type });
        break;

      case 'fantasypros': {
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

// POST - Crear/Upsert ranking manual
router.post('/manual', async (req, res) => {
  try {
    const { expert_id, sleeper_player_id, rank, tier } = req.body;
    if (!expert_id || !sleeper_player_id || typeof rank !== 'number') {
      return res.status(400).json({ error: 'expert_id, sleeper_player_id y rank son requeridos' });
    }

    // upsert por (expert_id, sleeper_player_id)
    const { data, error } = await supabase
      .from('manual_rankings')
      .upsert(
        { expert_id, sleeper_player_id, rank, tier: tier ?? null, updated_at: new Date() },
        { onConflict: 'expert_id,sleeper_player_id' }
      )
      .select();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    console.error('❌ POST /manual', err.message);
    res.status(500).json({ error: err.message });
  }
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
router.get('/manual/pending', async (req, res) => {
  try {
    const expertId = req.query.expert_id;
    const positions = (req.query.positions || 'WR,RB,TE,QB')
      .split(',')
      .map(s => s.trim().toUpperCase());
    const search = (req.query.search?.value || '').trim();

    const start = parseInt(req.query.start) || 0;
    const length = parseInt(req.query.length) || 50;
    const draw = parseInt(req.query.draw) || 1;

    if (!expertId) {
      return res.status(400).json({ error: 'Debe indicar expert_id' });
    }

    // 1) Traer todos los player_ids ya rankeados por este experto
    const { data: ranked, error: errRanked } = await supabase
      .from('manual_rankings')
      .select('sleeper_player_id')
      .eq('expert_id', expertId);

    if (errRanked) throw errRanked;

    // Limpia, deduplica y evita valores vacíos
    const rankedIds = Array.from(
      new Set((ranked || []).map(r => (r.sleeper_player_id || '').trim()).filter(Boolean))
    );

    // 2) Armar query base a players
    let query = supabase
      .from('players')
      .select('*', { count: 'exact' })
      .in('position', positions);

    // 3) Excluir los ya rankeados con not-in SIN comillas
    //    Ej: not.in.(id1,id2,id3)
    if (rankedIds.length > 0) {
      query = query.not('player_id', 'in', `(${rankedIds.join(',')})`);
    }

    // 4) Búsqueda (nombre/posición/equipo)
    if (search) {
      query = query.or(
        `full_name.ilike.%${search}%,position.ilike.%${search}%,team.ilike.%${search}%`
      );
    }

    // 5) Orden y paginación
    query = query.order('full_name', { ascending: true }).range(start, start + length - 1);

    const { data, count, error } = await query;
    if (error) throw error;

    const processed = (data || []).map(p => ({
      player_id: p.player_id,
      full_name: p.full_name,
      position: p.position,
      team: p.team,
      rank: null,
      tier: null
    }));

    res.json({
      draw,
      recordsTotal: count ?? 0,
      recordsFiltered: count ?? 0,
      players: processed
    });
  } catch (err) {
    console.error('❌ Error en /manual/pending:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST - Actualizar orden (rank) en bloque
router.post('/manual/order', async (req, res) => {
  try {
    const updates = req.body; // [{id, rank}, ...]
    if (!Array.isArray(updates)) return res.status(400).json({ error: 'Body inválido' });

    const chunks = [];
    const size = 100;
    for (let i = 0; i < updates.length; i += size) chunks.push(updates.slice(i, i + size));

    for (const chunk of chunks) {
      const promises = chunk.map(u =>
        supabase.from('manual_rankings').update({ rank: u.rank, updated_at: new Date() }).eq('id', u.id)
      );
      const results = await Promise.all(promises);
      const err = results.find(r => r.error);
      if (err) throw err.error;
    }

    res.json({ success: true });
  } catch (err) {
    console.error('❌ POST /manual/order', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
