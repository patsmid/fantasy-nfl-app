import fetch from 'node-fetch';
import { supabase } from './supabaseClient.js';

export async function getPlayers(req, res) {
  try {
    const start = parseInt(req.query.start) || 0;
    const length = parseInt(req.query.length) || 10;

    const from = start;
    const to = start + length - 1;

    const { data, count, error } = await supabase
      .from('players')
      .select('*', { count: 'exact' }) // Total de registros
      .range(from, to)
      .order('full_name');

    if (error) throw error;

    res.json({
      draw: parseInt(req.query.draw) || 1,
      recordsTotal: count,
      recordsFiltered: count,
      data,
    });
  } catch (err) {
    console.error('❌ Error en getPlayers:', err.message || err);
    res.status(500).json({ error: err.message });
  }
}

export async function getPlayersRAW(req, res) {
  try {
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .order('full_name')
      .range(0, 14999);

    if (error) throw error;

    res.json({ success: true, data });
  } catch (err) {
    console.error('❌ Error en getPlayers:', err.message || err);
    res.status(500).json({ success: false, error: err.message });
  }
}

function chunkArray(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size)
    result.push(array.slice(i, i + size));
  return result;
}

export async function updatePlayers() {
  const apiUrl = 'https://api.sleeper.app/v1/players/nfl';

  try {
    const response = await fetch(apiUrl);
    const players = await response.json();

    const data = Object.values(players).map(player => ({
      player_id: player.player_id,
      first_name: player.first_name,
      last_name: player.last_name,
      full_name: player.full_name,
      position: player.position,
      team: player.team,
      status: player.status,
      injury_status: player.injury_status,
      years_exp: player.years_exp
    })).filter(p => p.player_id);

    console.log(`🔄 Total jugadores a insertar/actualizar: ${data.length}`);

    const chunks = chunkArray(data, 500);
    for (const [i, chunk] of chunks.entries()) {
      const { error } = await supabase
        .from('players')
        .upsert(chunk, { onConflict: 'player_id' });

      if (error) {
        console.error(`❌ Error en chunk ${i + 1}:`, error.message);
      } else {
        chunk.forEach(p =>
          console.log(`✅ Insertado/Actualizado: ${p.full_name} (${p.player_id})`)
        );
      }
    }

    console.log('🎉 Todos los jugadores fueron procesados');
  } catch (err) {
    console.error('❌ Error en updatePlayers:', err.message || err);
  }
}
