import { supabase } from '../supabaseClient.js';

export async function getSleeperADP(req, res) {
  try {
    // Parámetros de DataTables
    const draw = parseInt(req.query.draw) || 1;
    const start = parseInt(req.query.start) || 0;
    const length = parseInt(req.query.length) || 10;

    // Orden
    const orderColIndex = req.query['order[0][column]'];
    const orderDir = req.query['order[0][dir]'] || 'asc';

    // Columnas (debe coincidir con las que usa DataTables)
    const columns = ['id', 'adp_type', 'sleeper_player_id', 'adp_value', 'adp_value_prev', 'date'];

    const orderCol = columns[orderColIndex] || 'adp_value';

    // Filtros por columna
    let queryFilters = {};
    columns.forEach((col, idx) => {
      const filter = req.query[`filter_col_${idx}`];
      if (filter) {
        // Para filtros básicos con contains insensible (ajusta según tu base)
        queryFilters[col] = filter;
      }
    });

    // Construir query Supabase
    let query = supabase.from('sleeper_adp_data').select('*', { count: 'exact' });

    // Aplicar filtros
    for (const [col, val] of Object.entries(queryFilters)) {
      query = query.ilike(col, `%${val}%`);
    }

    // Obtener total sin filtros para recordsTotal
    const { count: totalCount } = await supabase
      .from('sleeper_adp_data')
      .select('id', { count: 'exact', head: true });

    // Obtener total con filtros para recordsFiltered y datos paginados
    const { data, count: filteredCount, error } = await query
      .order(orderCol, { ascending: orderDir === 'asc' })
      .range(start, start + length - 1);

    if (error) throw error;

    res.json({
      draw,
      recordsTotal: totalCount,
      recordsFiltered: filteredCount,
      data,
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
