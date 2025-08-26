import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { supabase } from '../supabaseClient.js';

const TYPES = {
  'half-ppr': '',       // default
  'ppr': 'ppr',
  'standard': 'std'
};

const SCORING = {
  'half-ppr': 'HALF',
  'ppr': 'PPR',
  'standard': 'STD'
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
  if (!(type in SCORING)) throw Error('Tipo inválido');

  const url = `https://partners.fantasypros.com/api/v1/expert-rankings.php?id=7556&position=ALL&type=adp&scoring=${SCORING[type]}`;
  console.log('👉 URL usada:', url);

  const json = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  }).then(r => r.json());

  if (!json.players) {
    console.error('❌ No se encontró players en respuesta:', json);
    return [];
  }

  const players = json.players.map(p => ({
    rank: parseInt(p.rank_ecr) || null,   // rank de consenso
    name: p.player_name,
    team: p.player_team_id,
    position: p.player_positions,
    bye: p.bye_week ? parseInt(p.bye_week) : null,
    adp: p.rank_adp_raw ? parseFloat(p.rank_adp_raw) : null  // 👈 el que necesitas
  }));

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

export async function uploadFantasyProsADP(tipo = 'ppr') {
  const adp_type = `FP_${tipo}`;
  const today = new Date().toISOString().split('T')[0];
  const records = [];
  const notFound = [];
  const debug = []; // guardamos trazas para retornar (opcional)

  try {
    // 1) Obtener ADP
    const adpList = await getFantasyProsADP(tipo); // [{ rank, name, team, position, bye, adp }]
    if (!Array.isArray(adpList) || adpList.length === 0) {
      throw new Error('❌ No se obtuvieron datos de FantasyPros');
    }
    console.log(`📥 ADP recibidos: ${adpList.length}`);

    // 2) Cargar jugadores locales
    const playersData = await fetchAllPlayers(15000);
    if (!Array.isArray(playersData) || playersData.length === 0) {
      throw new Error('❌ No se pudieron cargar los jugadores desde Supabase');
    }
    console.log(`🎯 Jugadores cargados desde Supabase: ${playersData.length}`);

    // 3) Construir índices:
    //    - byName: normalizedName -> [players]
    //    - byNamePos: normalizedName|POS -> [players]
    //    - byNamePosTeam: normalizedName|POS|TEAM -> player (first)
    const byName = new Map();
    const byNamePos = new Map();
    const byNamePosTeam = new Map();

    const normalizeTeam = (t) => (t || '').toString().trim().toUpperCase();

    for (const p of playersData) {
      const fullName = (p.full_name || '').toString().trim();
      if (!fullName) continue;
      const norm = normalizeName(fullName);
      const pos = (p.position || '').toString().trim().toUpperCase();
      const team = normalizeTeam(p.team || p.team_abbreviation || p.sleeper_team || '');

      // byName
      if (!byName.has(norm)) byName.set(norm, []);
      byName.get(norm).push(p);

      // byNamePos
      const keyNP = `${norm}|${pos}`;
      if (!byNamePos.has(keyNP)) byNamePos.set(keyNP, []);
      byNamePos.get(keyNP).push(p);

      // byNamePosTeam (first wins)
      const keyNPT = `${norm}|${pos}|${team}`;
      if (!byNamePosTeam.has(keyNPT)) byNamePosTeam.set(keyNPT, p);
    }

    console.log('🔎 Índices construidos:', {
      names: byName.size,
      namePos: byNamePos.size,
      namePosTeam: byNamePosTeam.size
    });

    // Para evitar insertar duplicados por accidente
    const insertedIds = new Set();

    // 4) Procesar cada jugador de ADP
    for (const src of adpList) {
      const rawName = (src.name || '').toString().trim();
      const srcPos = (src.position || '').toString().trim().toUpperCase();
      const srcTeam = normalizeTeam(src.team);
      const srcAdpRaw = src.adp;
      const srcAdp = (srcAdpRaw !== undefined && srcAdpRaw !== null && srcAdpRaw !== '') ? Number(srcAdpRaw) : NaN;

      // log entrada
      console.log(`\n➡️ Procesando: "${rawName}" pos="${srcPos}" team="${srcTeam}" adp="${srcAdpRaw}"`);
      debug.push({ rawName, srcPos, srcTeam, srcAdpRaw });

      if (!rawName) {
        notFound.push({ reason: 'sin nombre', raw: src });
        continue;
      }
      const norm = normalizeName(rawName);

      // 4.1 Intento exacto: name|pos|team
      const keyNPT = `${norm}|${srcPos}|${srcTeam}`;
      let matched = byNamePosTeam.get(keyNPT);
      if (matched) {
        console.log(`   ✅ Match exacto por name|pos|team -> ${matched.full_name} [${matched.position} - ${matched.team || 'sin equipo'}]`);
      } else {
        // 4.2 Intento exacto por name|pos (puede devolver varios)
        const keyNP = `${norm}|${srcPos}`;
        const candidatesNP = byNamePos.get(keyNP) || [];
        if (candidatesNP.length === 1) {
          matched = candidatesNP[0];
          console.log(`   ✅ Match exacto por name|pos (único candidato) -> ${matched.full_name} [${matched.position}]`);
        } else if (candidatesNP.length > 1) {
          // si hay múltiples candidatos con mismo name+pos, tratar de elegir por team
          const byTeam = candidatesNP.find(c => normalizeTeam(c.team) === srcTeam);
          if (byTeam) {
            matched = byTeam;
            console.log(`   ✅ Entre múltiples name|pos, matched por team -> ${matched.full_name} [${matched.position} - ${matched.team}]`);
          } else {
            console.log(`   ⚠️ Múltiples candidatos por name|pos (${candidatesNP.length}). Candidates:`, candidatesNP.map(c => `${c.full_name} [${c.position}|${c.team}]`));
            // dejamos matched = null; vamos a intentar fuzzy más abajo sobre estos candidatos
          }
        } else {
          // 4.3 Intento por name solo (filtrando por posición si hay coincidencias)
          const candidatesName = byName.get(norm) || [];
          if (candidatesName.length === 1) {
            // si sólo uno existe con ese nombre, lo usamos sólo si la posición coincide o si adpList no tiene posición
            const only = candidatesName[0];
            if (!srcPos || (only.position || '').toUpperCase() === srcPos) {
              matched = only;
              console.log(`   ✅ Match por name único -> ${matched.full_name} [${matched.position}]`);
            } else {
              console.log(`   ⚠️ Nombre único pero posición difiere: ${only.full_name} tiene ${only.position} vs source ${srcPos}`);
            }
          } else if (candidatesName.length > 1) {
            // filtrar por posición entre los mismos nombre
            const candidatesNamePos = candidatesName.filter(c => (c.position || '').toUpperCase() === srcPos);
            if (candidatesNamePos.length === 1) {
              matched = candidatesNamePos[0];
              console.log(`   ✅ Entre mismos nombres, matched por posición -> ${matched.full_name} [${matched.position}]`);
            } else if (candidatesNamePos.length > 1) {
              // si hay varios mismo name+pos, intentar por equipo
              const byTeam = candidatesNamePos.find(c => normalizeTeam(c.team) === srcTeam);
              if (byTeam) {
                matched = byTeam;
                console.log(`   ✅ Entre mismos name+pos, matched por team -> ${matched.full_name} [${matched.position} - ${matched.team}]`);
              } else {
                console.log(`   ⚠️ Varios jugadores con mismo nombre y posición (${candidatesNamePos.length}). Candidates:`, candidatesNamePos.map(c => `${c.full_name} [${c.position}|${c.team}]`));
              }
            } else {
              // no hay candidatos con la misma posición -> los candidatesName (otros puestos) mostrarlos
              console.log(`   ⚠️ Hay jugadores con ese nombre pero sin coincidencia de posición:`, candidatesName.map(c => `${c.full_name} [${c.position}|${c.team}]`));
            }
          } else {
            // no hay por name
            console.log('   ❌ No hay candidatos por normalized name en Supabase');
          }
        }
      }

      // 4.4 Si no hay matched todavía, intentar fuzzy **entre candidatos que compartan la posición**.
      if (!matched && typeof fuzzySearch === 'function') {
        // priorizar: candidatesNP (name+pos), si vacíos -> todos playersData filtrando por pos
        let fuzzyCandidates = byNamePos.get(`${norm}|${srcPos}`) || [];
        if (!fuzzyCandidates.length) {
          // si no hay name+pos, tomar todos con la posición (reduce scope)
          fuzzyCandidates = playersData.filter(p => (p.position || '').toUpperCase() === srcPos);
        }
        // si aún no hay candidatos, ampliar al dataset completo (pero esto puede false-positive)
        if (!fuzzyCandidates.length) {
          fuzzyCandidates = playersData;
        }

        console.log(`   🔎 Usando fuzzySearch entre ${fuzzyCandidates.length} candidatos (filtrados por pos si fue posible).`);
        let fuzzyResults;
        try {
          fuzzyResults = fuzzySearch(rawName, fuzzyCandidates, {
            key: p => p.full_name,
            normalize: normalizeName
          });
        } catch (e) {
          console.warn('   ⚠️ fuzzySearch lanzó error:', e);
          fuzzyResults = null;
        }

        let best = null;
        if (Array.isArray(fuzzyResults) && fuzzyResults.length > 0) {
          // fuzzySearch puede devolver objetos directos o estructuras; intentar normalizar
          best = fuzzyResults[0];
          // si el resultado tiene formato {item,score} o similar, normalizar:
          if (best && best.item) best = best.item;
          console.log('   🤖 Resultado fuzzy top:', best ? `${best.full_name} [${best.position}|${best.team}]` : best);
        } else {
          console.log('   ❌ fuzzySearch no devolvió resultados útiles.');
        }

        if (best) {
          // asegurar que la posición coincide (protección extra)
          if (!srcPos || (best.position || '').toUpperCase() === srcPos) {
            matched = best;
            console.log(`   ✅ Selected fuzzy -> ${matched.full_name} [${matched.position} - ${matched.team}]`);
          } else {
            console.log(`   ⚠️ Best fuzzy tiene posición distinta (${best.position}) vs source ${srcPos}. Ignorando.`);
          }
        }
      }

      // 4.5 Si aún no matched, añadir a notFound (junto con contexto)
      if (!matched) {
        // recopilar candidatos cercanos para depuración
        const nearby = (byName.get(norm) || []).slice(0, 6).map(c => `${c.full_name} [${c.position}|${c.team}]`);
        console.warn(`   ❌ No matched para "${rawName}" (${srcPos}). Nearby:`, nearby);
        notFound.push({ name: rawName, pos: srcPos, team: srcTeam, nearby });
        continue;
      }

      // 4.6 Matcheado: validar adp y push
      if (!matched.player_id) {
        console.warn(`   ⚠️ Matched sin player_id: ${JSON.stringify(matched)}`);
        notFound.push({ name: rawName, pos: srcPos, reason: 'matched sin player_id' });
        continue;
      }
      if (isNaN(srcAdp)) {
        console.warn(`   ⚠️ ADP inválido para ${rawName}: ${srcAdpRaw}`);
        notFound.push({ name: rawName, pos: srcPos, team: srcTeam, reason: 'adp inválido' });
        continue;
      }

      if (insertedIds.has(matched.player_id)) {
        console.log(`   ℹ️ Ya se agregó ${matched.full_name} (player_id=${matched.player_id}), salto duplicado.`);
        continue;
      }

      records.push({
        adp_type,
        sleeper_player_id: matched.player_id,
        adp_value: Number(srcAdp),
        adp_value_prev: 0,
        date: today
      });
      insertedIds.add(matched.player_id);

      console.log(`   ➕ Preparado registro: ${matched.full_name} id=${matched.player_id} adp=${srcAdp}`);
    } // end for each adp player

    console.log(`\n📊 Total ADP: ${adpList.length}`);
    console.log(`✅ A insertar: ${records.length}`);
    console.log(`⚠️ No encontrados: ${notFound.length}`);

    if (records.length === 0) {
      return { adp_type, inserted: 0, skipped: notFound.length, message: 'No se insertó ningún dato', debug: { notFound, debug } };
    }

    // 5) Borrar previos y subir nuevos
    console.log(`🧹 Borrando ADP previos de tipo ${adp_type}...`);
    const { error: delError } = await supabase
      .from('sleeper_adp_data')
      .delete()
      .eq('adp_type', adp_type);

    if (delError) {
      console.error('🧨 Error al borrar previos:', delError);
      throw delError;
    }

    console.log('📤 Insertando nuevos registros...');
    const { error: insertError } = await supabase
      .from('sleeper_adp_data')
      .insert(records);

    if (insertError) {
      console.error('🧨 Error al insertar en Supabase:', insertError);
      throw insertError;
    }

    console.log(`✅ Insertados ${records.length} registros [${adp_type}]`);
    if (notFound.length > 0) {
      console.warn(`⚠️ Sin match (${notFound.length}). Ejemplos:`, notFound.slice(0, 10));
    }

    return {
      adp_type,
      inserted: records.length,
      skipped: notFound.length,
      message: 'ADP cargado exitosamente',
      debug: { notFound: notFound.slice(0, 50), samples: debug.slice(0, 20) } // opcional, quita si no quieres retorno grande
    };

  } catch (err) {
    console.error('❌ Error al subir datos de FantasyPros:', err);
    return {
      adp_type,
      inserted: 0,
      skipped: 0,
      message: `Error: ${err.message || err}`,
      debug: { error: String(err) }
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
