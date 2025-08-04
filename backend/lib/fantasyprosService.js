import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { supabase } from '../supabaseClient.js';
import { fuzzySearch } from '../utils/helpers.js';

const TYPES = {
  'half-ppr': 'half-point-ppr-overall',
  'ppr': 'ppr-overall'
};

function normalizeHeader(str) {
  return str.toLowerCase().replace(/\s+/g, ' ').trim();
}

function parsePlayerRaw(raw) {
  const match = raw.match(/^(.*?)\s+([A-Z]{2,3})\s*\((\d{1,2})\)$/);
  return match
    ? { name: match[1].trim(), team: match[2], bye: match[3] }
    : { name: raw.trim(), team: null, bye: null };
}

export async function getFantasyProsADP(type = 'half-ppr') {
  if (!TYPES[type]) throw Error('Tipo inválido');
  const url = `https://www.fantasypros.com/nfl/adp/${TYPES[type]}.php`;

  const html = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  }).then(r => r.text());

  const $ = cheerio.load(html);
  const table = $('#data');
  const headers = table.find('thead th').map((i, el) => normalizeHeader($(el).text())).get();

  const players = [];

  table.find('tbody tr').each((_, tr) => {
    const cols = $(tr).find('td');
    const obj = {};
    cols.each((i, td) => {
      obj[headers[i]] = $(td).text().trim();
    });

    const raw = obj['player'] || obj['player team (bye)'] || obj['player (team bye)'] || '';
    const { name, team, bye } = parsePlayerRaw(raw);

    players.push({
      rank: parseInt(obj['#'] || obj['rank']) || null,
      name,
      team,
      position: obj['pos'] || obj['position'] || null,
      bye,
      adp: parseFloat(obj['adp'] || obj['ppr adp'] || obj['avg']) || null
    });
  });

  return players;
}

export async function getFantasyProsADPData(req, res) {
  try {
    const tipos = ['FP_ppr', 'FP_half-ppr'];

    const { data, error } = await supabase
      .from('sleeper_adp_data')
      .select('*')
      .in('adp_type', tipos)
      .order('date', { ascending: false });

    if (error) throw error;

    res.json({ success: true, data });
  } catch (err) {
    console.error('❌ Error al obtener ADP desde Supabase:', err.message || err);
    res.status(500).json({ success: false, error: err.message });
  }
}

function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z\s.']/gi, '')         // quita caracteres raros (asteriscos, paréntesis, etc.)
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, '') // elimina sufijos comunes
    .replace(/\s+/g, ' ')                 // normaliza espacios
    .trim();
}

export async function uploadFantasyProsADP(tipo = 'ppr') {
  const adp_type = `FP_${tipo}`;
  const today = new Date().toISOString().split('T')[0];
  const records = [];
  const notFound = [];

  try {
    const adpList = await getFantasyProsADP(tipo); // [{ rank, name, team, position, bye, adp }]

    // Obtener los jugadores directo desde Supabase
    const { data: playersData, error: playersError } = await supabase
      .from('players')
      .select('player_id, full_name')
      .limit(15000);

    if (playersError || !Array.isArray(playersData) || playersData.length === 0) {
      throw new Error(playersError?.message || '❌ playersData vacío o inválido');
    }

    // Crear índice de nombres exactos
    const nameIndex = new Map();
    for (const p of playersData) {
      if (p.full_name) nameIndex.set(normalizeName(p.full_name), p);
    }

    for (const player of adpList) {
      const normName = normalizeName(player.name);
      const exact = nameIndex.get(normName);

      let matched = exact;

      if (!matched && typeof fuzzySearch === 'function') {
        const fuzzy = fuzzySearch(player.name, playersData);
        if (fuzzy?.[0]) matched = fuzzy[0];
      }

      if (matched?.player_id) {
        records.push({
          adp_type,
          sleeper_player_id: matched.player_id,
          adp_value: Number(player.adp),
          adp_value_prev: 0,
          date: today
        });
      } else {
        notFound.push(player.name);
      }
    }

    console.log(`📊 Total obtenidos: ${adpList.length}`);
    console.log(`✅ Matcheados: ${records.length}`);
    console.log(`⚠️ No encontrados: ${notFound.length}`);

    if (records.length === 0) {
      return { adp_type, inserted: 0, skipped: notFound.length, message: 'No se insertó ningún dato' };
    }

    // Eliminar registros anteriores de este tipo
    const { error: delError } = await supabase
      .from('sleeper_adp_data')
      .delete()
      .eq('adp_type', adp_type);

    if (delError) throw new Error(`Error al borrar ADP previos: ${delError.message}`);

    const { error: insertError } = await supabase
      .from('sleeper_adp_data')
      .insert(records);

    if (insertError) {
      console.error('🧨 Error al insertar en Supabase:', insertError);
      throw insertError;
    }

    console.log(`✅ Insertados ${records.length} registros de ADP [${adp_type}]`);
    if (notFound.length > 0) {
      console.warn(`⚠️ Sin match (${notFound.length}): ${notFound.slice(0, 10).join(', ')}${notFound.length > 10 ? ', …' : ''}`);
    }

    return {
      adp_type,
      inserted: records.length,
      skipped: notFound.length,
      message: 'ADP cargado exitosamente'
    };

  } catch (err) {
    console.error('❌ Error al subir datos de FantasyPros:', err.message || err);
    return {
      adp_type,
      inserted: 0,
      skipped: 0,
      message: `Error: ${err.message || err}`
    };
  }
}

export async function uploadAllFantasyProsADP() {
  const tipos = ['ppr', 'half-ppr'];
  const results = await Promise.all(tipos.map(uploadFantasyProsADP));
  console.log('🎉 ADP de FantasyPros cargado para PPR y Half-PPR');
  return results;
}
