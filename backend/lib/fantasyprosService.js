import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { supabase } from '../supabaseClient.js';

const TYPES = {
  'half-ppr': '',       // default
  'ppr': 'ppr',
  'standard': 'std'
};

export async function getFantasyProsADPDataSimple({
  adp_type = null,
  date = null,
  full_name = null,
  team = null,
  position = null
} = {}) {
  const tipos = ['FP_ppr', 'FP_half-ppr'];

  try {
    let query = supabase
      .from('sleeper_adp_data')
      .select('*')
      .in('adp_type', tipos);

    if (adp_type) query = query.eq('adp_type', adp_type);
    if (date) query = query.eq('date', date);
    if (full_name) query = query.eq('full_name', full_name);
    if (team) query = query.eq('team', team);
    if (position) query = query.eq('position', position);

    query = query.order('adp_value', { ascending: true });

    const { data: adpData, error } = await query;
    if (error) throw error;

    const uniqueIds = [...new Set(adpData.map(p => p.sleeper_player_id).filter(Boolean))];

    const { data: players, error: errPlayers } = await supabase
      .from('players')
      .select('player_id, full_name, position, team')
      .in('player_id', uniqueIds);

    if (errPlayers) throw errPlayers;

    return adpData.map(row => {
      const player = players.find(p => p.player_id === row.sleeper_player_id);
      return {
        id: row.id,
        adp_type: row.adp_type,
        sleeper_player_id: row.sleeper_player_id,
        adp_value: row.adp_value,
        adp_value_prev: row.adp_value_prev,
        date: row.date,
        full_name: player?.full_name || '',
        position: player?.position || '',
        team: player?.team || ''
      };
    });
  } catch (err) {
    console.error('❌ Error en getFantasyProsADPDataSimple:', err.message || err);
    throw err;
  }
}

function normalizeHeader(header) {
  return header.trim().toLowerCase().replace(/\s+/g, ' ');
}

function parsePlayerRaw(raw) {
  let name = raw;
  let team = null;
  let bye = null;

  // Extraer bye week
  const byeMatch = raw.match(/\(Bye:\s*(\d+)\)/i);
  if (byeMatch) {
    bye = parseInt(byeMatch[1], 10);
    name = raw.replace(byeMatch[0], '').trim();
  }

  // Extraer team abreviado tipo "MIN"
  const teamMatch = raw.match(/\(([A-Z]{2,3})\s*-\s*[A-Z]+\)/);
  if (teamMatch) {
    team = teamMatch[1];
  } else {
    const teamOnlyMatch = raw.match(/\b([A-Z]{2,3})\b/);
    if (teamOnlyMatch) team = teamOnlyMatch[1];
  }

  // Limpiar paréntesis sobrantes
  name = name.replace(/\(.*?\)/g, '').trim();

  return { name, team, bye };
}

export async function getFantasyProsADP(type = 'half-ppr') {
  if (!(type in TYPES)) throw Error('Tipo inválido');

  const suffix = TYPES[type] ? `/${TYPES[type]}` : '';
  const url = `https://www.fantasypros.com/nfl/real-time-adp${suffix}`;

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
      adp: parseFloat(obj['real-time']) || null   // 👈 ahora usa REAL-TIME
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

    query = query.order('adp_value', { ascending: true }); // Orden ascendente por ADP

    const { data: adpData, error } = await query;
    if (error) throw error;

    // 2. Obtener players relacionados por sleeper_player_id
    const uniqueIds = [...new Set(adpData.map(p => p.sleeper_player_id).filter(Boolean))];

    const { data: players, error: errPlayers } = await supabase
      .from('players')
      .select('player_id, full_name, position, team')
      .in('player_id', uniqueIds);

    if (errPlayers) throw errPlayers;

    // 3. Unir datos y retornar estructura simplificada
    const merged = adpData.map(row => {
      const player = players.find(p => p.player_id === row.sleeper_player_id);
      return {
        id: row.id,
        adp_type: row.adp_type,
        sleeper_player_id: row.sleeper_player_id,
        adp_value: row.adp_value,
        adp_value_prev: row.adp_value_prev,
        date: row.date,
        full_name: player?.full_name || '',
        position: player?.position || '',
        team: player?.team || ''
      };
    });

    res.json({ success: true, data: merged });
  } catch (err) {
    console.error('❌ Error al obtener ADP de FantasyPros:', err.message || err);
    res.status(500).json({ success: false, error: err.message });
  }
}

function normalizeName(name) {
  if (!name || typeof name !== 'string') return '';

  return name
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')  // elimina sufijos comunes
    .replace(/[^a-z0-9]/g, '')                // elimina caracteres especiales
    .normalize('NFD')                         // convierte acentos en marcas
    .replace(/[\u0300-\u036f]/g, '')          // elimina marcas diacríticas
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
        const candidates = playersData.filter(p => p.position === player.position);
        const fuzzy = fuzzySearch(rawName, candidates, {
          key: p => p.full_name,
          normalize: normalizeName,
          expectedPosition: player.position
        });
        if (fuzzy?.[0]) {
          matched = fuzzy[0];
          console.log(`🤖 Fuzzy match: "${rawName}" ➜ "${matched.full_name}" [${matched.position}]`);
        }
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

function fuzzySearch(name, list, { key, normalize, expectedPosition }) {
  if (!name || !Array.isArray(list)) return [];

  const target = normalize(name);
  let best = null;
  let minScore = Infinity;

  for (const item of list) {
    const value = key(item);
    if (!value || typeof value !== 'string') continue;

    const itemName = normalize(value);
    let dist = levenshteinDistance(target, itemName);

    // Penalización por diferencia de posición
    if (expectedPosition && item.position && item.position !== expectedPosition) {
      dist += 2; // penaliza si no coincide la posición
    }

    if (dist < minScore) {
      minScore = dist;
      best = item;
    }
  }

  return minScore <= 3 ? [best] : [];
}

// Simple Levenshtein implementation
function levenshteinDistance(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return Infinity;

  const dp = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0)
  );

  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,     // Eliminación
        dp[i][j - 1] + 1,     // Inserción
        dp[i - 1][j - 1] + cost // Sustitución
      );
    }
  }

  return dp[a.length][b.length];
}
