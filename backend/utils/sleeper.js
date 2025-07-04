import { supabase } from '../supabaseClient.js';

export async function getSleeperADP(req, res) {
  try {
    // Parámetros DataTables
    const draw = parseInt(req.query.draw) || 1;
    const start = parseInt(req.query.start) || 0;
    const length = parseInt(req.query.length) || 10;

    // Orden
    const orderColIndex = req.query['order[0][column]'];
    const orderDir = req.query['order[0][dir]'] || 'asc';

    // Columnas para filtrado y orden - considera las nuevas columnas join
    const columns = [
      'id',
      'adp_type',
      'sleeper_player_id',
      'adp_value',
      'adp_value_prev',
      'date',
      'players.full_name',
      'players.position',
      'players.team'
    ];

    // Para orden, solo usa columnas simples (de sleeper_adp_data)
    const simpleColumns = ['id', 'adp_type', 'sleeper_player_id', 'adp_value', 'adp_value_prev', 'date'];
    const orderCol = simpleColumns[orderColIndex] || 'adp_value';

    // Filtros por columna solo para sleeper_adp_data campos
    let queryFilters = {};
    simpleColumns.forEach((col, idx) => {
      const filter = req.query[`filter_col_${idx}`];
      if (filter) {
        queryFilters[col] = filter;
      }
    });

    // Construir query con join a players
    let query = supabase
      .from('sleeper_adp_data')
      .select(`
        *,
        players:players!sleeper_player_id (
          full_name,
          position,
          team
        )
      `, { count: 'exact' });

    // Aplicar filtros a sleeper_adp_data
    for (const [col, val] of Object.entries(queryFilters)) {
      query = query.ilike(col, `%${val}%`);
    }

    // Total sin filtros
    const { count: totalCount } = await supabase
      .from('sleeper_adp_data')
      .select('id', { count: 'exact', head: true });

    // Datos paginados con filtros y orden
    const { data, count: filteredCount, error } = await query
      .order(orderCol, { ascending: orderDir === 'asc' })
      .range(start, start + length - 1);

    if (error) throw error;

    // Ajustar el formato para que frontend tenga las columnas directas
    // mapear data para aplanar la info de players
    const mappedData = data.map(row => ({
      id: row.id,
      adp_type: row.adp_type,
      sleeper_player_id: row.sleeper_player_id,
      adp_value: row.adp_value,
      adp_value_prev: row.adp_value_prev,
      date: row.date,
      full_name: row.players?.full_name || null,
      position: row.players?.position || null,
      team: row.players?.team || null,
    }));

    res.json({
      draw,
      recordsTotal: totalCount,
      recordsFiltered: filteredCount,
      data: mappedData,
    });
  } catch (err) {
    console.error('❌ Error en /sleeperADP:', err.message || err);
    res.status(500).json({ error: err.message });
  }
}

export async function getSleeperLeague(leagueId) {
  const response = await fetch(`https://api.sleeper.app/v1/league/${leagueId}`);
  if (!response.ok) {
    throw new Error(`Sleeper API error: ${response.statusText}`);
  }
  return await response.json();
}

export async function getLeagueDraft(draftId) {
  const response = await fetch(`https://api.sleeper.app/v1/draft/${draftId}/picks`);
  if (!response.ok) {
    throw new Error(`Sleeper API error: ${response.statusText}`);
  }
  return await response.json();
}

export async function updateSleeperADP(req, res) {
  try {
    const scriptUrl = 'https://script.google.com/macros/s/AKfycbzJKeM4mnNWbnIhGiOlRfCyEfccXfMVD8Zpp1300eRFVcRNgUGF7bZuRrd3D2xDXfYC/exec';
    const authKey = 'f4nt4sy-@dp-sync-92js83sk'; // Usa una variable de entorno segura

    const response = await fetch(`${scriptUrl}?auth=${authKey}`);
    const text = await response.text();

    res.json({ success: true, result: text });
  } catch (err) {
    console.error('❌ Error actualizando ADP:', err.message || err);
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getLatestADPDate(req, res) {
  try {
    const { data, error } = await supabase
      .from('sleeper_adp_data')
      .select('date')
      .order('date', { ascending: false })
      .limit(1);

    if (error) throw error;

    const latestDate = data?.[0]?.date;

    const clientModifiedSince = req.headers['if-modified-since'];
    if (clientModifiedSince && new Date(clientModifiedSince) >= new Date(latestDate)) {
      return res.status(304).end(); // ✅ No hay cambios
    }

    res.setHeader('Last-Modified', new Date(latestDate).toUTCString());
    res.json({ success: true, latestDate });
  } catch (err) {
    console.error('❌ Error en getLatestADPDate:', err.message || err);
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getADPTypes(req, res) {
  try {
    const { data, error } = await supabase
      .from('sleeper_adp_data')
      .select('adp_type')
      .neq('adp_type', null)
      .then((res) => {
        // Eliminar duplicados manualmente ya que Supabase no soporta `distinct` directo con JS SDK
        const unique = [...new Set(res.data.map(item => item.adp_type))];
        return { data: unique };
      });

    if (error) throw error;

    res.json({ success: true, adp_types: data });
  } catch (err) {
    console.error('❌ Error en getADPTypes:', err.message || err);
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getUniqueSleeperADPValues(req, res) {
  try {
    const { column } = req.query;

    if (!column) return res.status(400).json({ error: 'Falta parámetro column' });

    let data = [];
    if (['adp_type', 'date'].includes(column)) {
      // Valores únicos directos en sleeper_adp_data
      const { data: rows, error } = await supabase
        .from('sleeper_adp_data')
        .select(column)
        .neq(column, null)
        .neq(column, '')
        .order(column, { ascending: true });

      if (error) throw error;

      data = [...new Set(rows.map(r => r[column]))];
    } else if (['full_name', 'position', 'team'].includes(column)) {
      // Valores únicos de players
      const { data: rows, error } = await supabase
        .from('players')
        .select(column)
        .neq(column, null)
        .neq(column, '')
        .order(column, { ascending: true });

      if (error) throw error;

      data = [...new Set(rows.map(r => r[column]))];
    } else {
      return res.status(400).json({ error: 'Columna no soportada para filtro' });
    }

    res.json({ success: true, data });
  } catch (err) {
    console.error('❌ Error en /sleeperADP/unique-values:', err.message || err);
    res.status(500).json({ success: false, error: err.message });
  }
}
