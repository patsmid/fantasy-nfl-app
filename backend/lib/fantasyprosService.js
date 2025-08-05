import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { supabase } from '../supabaseClient.js';

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
    const { adp_type, date, full_name, team, position } = req.query;

    // 1. Obtener registros desde sleeper_adp_data
    let query = supabase
      .from('sleeper_adp_data')
      .select('*')
      .in('adp_type', tipos);

    if (adp_type) query = query.eq('adp_type', adp_type);
    if (date) query = query.eq('date', date);
    if (full_name) query = query.eq('full_name', full_name);
    if (team) query = query.eq('team', team);
    if (position) query = query.eq('position', position);

    query = query.order('adp_value', { ascending: false });

    const { data: adpData, error } = await query;
    if (error) throw error;

    // 2. Obtener players relacionados por sleeper_player_id
    const uniqueIds = [...new Set(adpData.map(p => p.sleeper_player_id).filter(Boolean))];

    const { data: players, error: errPlayers } = await supabase
      .from('players')
      .select('*')
      .in('player_id', uniqueIds);

    if (errPlayers) throw errPlayers;

    // 3. Unir datos manualmente
    const merged = adpData.map(row => {
      const player = players.find(p => p.player_id === row.sleeper_player_id);
      return {
        ...row,
        player: player || null
      };
    });

    res.json({ success: true, data: merged });
  } catch (err) {
    console.error('❌ Error al obtener ADP de FantasyPros:', err.message || err);
    res.status(500).json({ success: false, error: err.message });
  }
}

function normalizeName(name) {
  return name
    .toLowerCase()
    .normalize('NFD') // Elimina acentos
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '') // Quita todo menos letras y números
    .trim();
}

// Función auxiliar para cargar jugadores en chunks
async function fetchAllPlayers(limit = 15000, chunkSize = 1000) {
  const allPlayers = [];

  for (let from = 0; from < limit; from += chunkSize) {
    const to = from + chunkSize - 1;

    const { data, error } = await supabase
      .from('players')
      .select('player_id, full_name')
      .range(from, to);

    if (error) {
      console.error(`❌ Error en chunk ${from}-${to}:`, error.message);
      break;
    }

    if (!data || data.length === 0) break;

    allPlayers.push(...data);

    if (data.length < chunkSize) break;
  }

  return allPlayers;
}

// Función principal
export async function uploadFantasyProsADP(tipo = 'ppr') {
  const adp_type = `FP_${tipo}`;
  const today = new Date().toISOString().split('T')[0];
  const records = [];
  const notFound = [];

  try {
    const adpList = await getFantasyProsADP(tipo); // [{ rank, name, team, position, bye, adp }]
    if (!Array.isArray(adpList) || adpList.length === 0) {
      throw new Error('❌ No se obtuvieron datos de FantasyPros');
    }

    const playersData = await fetchAllPlayers(15000);
    console.log(`🎯 Jugadores cargados desde Supabase: ${playersData.length}`);

    if (!Array.isArray(playersData) || playersData.length === 0) {
      throw new Error('❌ No se pudieron cargar los jugadores desde Supabase');
    }

    // Crear índice por nombre normalizado
    const nameIndex = new Map();
    for (const p of playersData) {
      const name = p.full_name?.trim();
      if (name) {
        const normalized = normalizeName(name);
        if (!nameIndex.has(normalized)) {
          nameIndex.set(normalized, p);
        }
      }
    }

    for (const player of adpList) {
      const rawName = player.name?.trim();
      if (!rawName) {
        notFound.push(`Nombre inválido: ${JSON.stringify(player)}`);
        continue;
      }

      const normalizedName = normalizeName(rawName);
      let matched = nameIndex.get(normalizedName);

      // Fuzzy match si no hay exacto
      if (!matched && typeof fuzzySearch === 'function') {
        const fuzzy = fuzzySearch(rawName, playersData, {
          key: p => p.full_name,
          normalize: normalizeName
        });
        if (fuzzy?.[0]) matched = fuzzy[0];
      }

      if (matched?.player_id) {
        const adpValue = Number(player.adp);
        if (!isNaN(adpValue)) {
          records.push({
            adp_type,
            sleeper_player_id: matched.player_id,
            adp_value: adpValue,
            adp_value_prev: 0,
            date: today
          });
        } else {
          console.warn(`⚠️ ADP inválido para ${rawName}:`, player.adp);
        }
      } else {
        notFound.push(`${rawName} (→ ${normalizedName})`);
      }
    }

    console.log(`📊 Total obtenidos: ${adpList.length}`);
    console.log(`✅ Matcheados: ${records.length}`);
    console.log(`⚠️ No encontrados: ${notFound.length}`);

    if (records.length === 0) {
      return { adp_type, inserted: 0, skipped: notFound.length, message: 'No se insertó ningún dato' };
    }

    // Eliminar anteriores
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

function fuzzySearch(name, list, { key, normalize }) {
  const target = normalize(name);
  let best = null;
  let minDist = Infinity;

  for (const item of list) {
    const itemName = normalize(key(item));
    const dist = levenshteinDistance(target, itemName);
    if (dist < minDist) {
      minDist = dist;
      best = item;
    }
  }

  return minDist <= 3 ? [best] : []; // ajusta tolerancia
}

// Simple Levenshtein implementation
function levenshteinDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }

  return dp[a.length][b.length];
}
