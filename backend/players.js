import fetch from 'node-fetch';
import { supabase } from './supabaseClient.js';
import { getMexicoCityISOString } from './utils/helpers.js';

export async function getPlayers(req, res) {
  try {
    const start = parseInt(req.query.start) || 0;
    const length = parseInt(req.query.length) || 10;
    const draw = parseInt(req.query.draw) || 1;
    const searchValue = req.query.search?.value?.trim() || '';

    const from = start;
    const to = start + length - 1;

    const columns = [
      'id',
      'player_id',
      'first_name',
      'last_name',
      'full_name',
      'position',
      'team',
      'status',
      'injury_status',
      'years_exp',
      'bye_week'
    ];

    let query = supabase
      .from('players')
      .select('*', { count: 'exact' })
      .not('team', 'is', null)
      .not('team', 'eq', '');

    // 🔍 Filtro global extendido: nombre + position + team
    if (searchValue) {
      query = query.or(
        `full_name.ilike.%${searchValue}%,` +
        `first_name.ilike.%${searchValue}%,` +
        `last_name.ilike.%${searchValue}%,` +
        `position.ilike.%${searchValue}%,` +
        `team.ilike.%${searchValue}%`
      );
    }

    // (Opcional) filtros personalizados por columna
    columns.forEach((col, index) => {
      const value = req.query[`filter_col_${index}`];
      if (value && value.trim() !== '') {
        query = query.ilike(col, `%${value}%`);
      }
    });

    // Ordenar por id descendente
    query = query.order('id', { ascending: false });

    // Aplicar paginación
    query = query.range(from, to);

    const { data, count, error } = await query;

    if (error) throw error;

    const processedData = data.map((player) => ({
      ...player,
      full_name:
        player.full_name?.trim() ||
        `${player.first_name || ''} ${player.last_name || ''}`.trim()
    }));

    res.json({
      draw,
      recordsTotal: count,
      recordsFiltered: count,
      data: processedData
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
      .order('full_name', { ascending: true })
      .limit(15000); // más semántico que .range(0, 14999)

    if (error || !data) {
      throw new Error(error?.message || 'No se pudo obtener datos de jugadores');
    }

    res.status(200).json({
      success: true,
      count: data.length,
      data
    });
  } catch (err) {
    console.error('❌ Error en getPlayersRAW:', err.message || err);
    res.status(500).json({
      success: false,
      error: err.message || 'Error inesperado'
    });
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

    // 1️⃣ Obtener jugadores activos
    const activePlayers = Object.values(players)
      .filter(player => player.active === true && player.player_id)
      .map(player => ({
        player_id: player.player_id,
        first_name: player.first_name,
        last_name: player.last_name,
        full_name: player.full_name,
        position: player.position,
        team: player.team,
        status: player.status,
        injury_status: player.injury_status,
        years_exp: player.years_exp
      }));

    console.log(`✅ Jugadores activos encontrados: ${activePlayers.length}`);

    // 2️⃣ Obtener todos los player_id actuales en la base de datos
    const { data: existingPlayers, error: fetchError } = await supabase
      .from('players')
      .select('player_id');

    if (fetchError) {
      console.error('❌ Error al obtener jugadores existentes:', fetchError.message);
      return;
    }

    const existingIds = existingPlayers.map(p => String(p.player_id));
    const activeIds = activePlayers.map(p => String(p.player_id));
    const idsToDelete = existingIds.filter(id => !activeIds.includes(id));

    console.log(`🔍 Total IDs en Supabase: ${existingIds.length}`);
    console.log(`🧮 Total IDs activos desde API: ${activeIds.length}`);
    console.log(`🗑️ IDs a eliminar:`, idsToDelete);

    if (idsToDelete.length > 0) {
      const deleteChunks = chunkArray(idsToDelete, 500);
      for (const [i, ids] of deleteChunks.entries()) {
        console.log(`🚨 Eliminando chunk ${i + 1} con ${ids.length} IDs`);

        const { error: deleteError } = await supabase
          .from('players')
          .delete()
          .in('player_id', ids);

        if (deleteError) {
          console.error(`❌ Error eliminando chunk ${i + 1}:`, deleteError.message);
        } else {
          console.log(`✅ Chunk ${i + 1} eliminado correctamente`);
        }
      }
    }

    // 6️⃣ Registrar fecha de actualización
    const now = getMexicoCityISOString();
    const { error: configError } = await supabase
      .from('config')
      .upsert({ key: 'playerDB_updated', value: now }, { onConflict: 'key' });

    if (configError) {
      console.warn('⚠️ No se pudo actualizar playerDB_updated:', configError.message);
    } else {
      console.log(`🕒 Actualización registrada en config: ${now}`);
    }

    console.log('🎉 Jugadores activos actualizados y los inactivos eliminados');
  } catch (err) {
    console.error('❌ Error en updatePlayers:', err.message || err);
  }
}
