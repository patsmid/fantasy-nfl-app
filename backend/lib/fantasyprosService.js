import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { supabase } from '../supabaseClient.js';
import { getPlayersData } from './draftUtils.js';
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
  console.log('Encabezados:', headers);

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

export async function uploadFantasyProsADP(tipo = 'ppr') {
  try {
    const adp_type = `FP_${tipo}`;
    const adpList = await getFantasyProsADP(tipo); // [{ rank, name, team, position, bye, adp }]
    const playersData = await getPlayersData();    // [{ player_id, full_name, ... }]

    const today = new Date().toISOString().split('T')[0];
    const records = [];
    const notFound = [];

    // Crear índice de nombres
    const nameIndex = new Map();
    for (const p of playersData) {
      nameIndex.set(p.full_name.toLowerCase(), p);
    }

    for (const player of adpList) {
      const matched = nameIndex.get(player.name.toLowerCase()) ||
                      (fuzzySearch ? fuzzySearch(player.name, playersData)[0] : null);

      if (matched) {
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

    if (records.length === 0) {
      console.warn('⚠️ No se generaron registros válidos para insertar.');
      return { adp_type, inserted: 0, skipped: notFound.length, message: 'No se insertó ningún dato' };
    }

    // Eliminar registros anteriores del mismo tipo y fecha
    await supabase
      .from('sleeper_adp_data')
      .delete()
      .eq('adp_type', adp_type);

    const { error } = await supabase
      .from('sleeper_adp_data')
      .insert(records);

    if (error) throw error;

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
      adp_type: `FP_${tipo}`,
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
