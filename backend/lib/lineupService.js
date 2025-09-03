import { getSleeperLeague, getRosters } from '../utils/sleeper.js';
import { getConfigValue, getPlayersData, getPlayersByNames } from './draftUtils.js';
import { getRankings, getDSTRankings, getKickerRankings } from './rankingsService.js';
import { getStarterPositions, fuzzySearch } from '../utils/helpers.js';
import { generateLineup } from './lineupUtils.js';
import { getExpertData } from '../experts.js';

export async function getLineupData(
  leagueId,
  { idExpert = null, position = 'TODAS', week = 1 } = {}
) {
  // 1. Datos de la liga y configuración
  const leagueData = await getSleeperLeague(leagueId);
  const starterPositions = getStarterPositions(leagueData);
  const superFlex = starterPositions.includes('SUPER_FLEX');
  const scoring =
    leagueData.scoring_settings?.rec === 1
      ? 'PPR'
      : leagueData.scoring_settings?.rec === 0.5
      ? 'HALF'
      : 'STANDARD';

  const tipoLiga = await getConfigValue('dynasty');
  const dynasty = leagueData.settings.type === 2 && tipoLiga === 'LIGA';
  const finalPosition = superFlex && position === 'TODAS' ? 'SUPER FLEX' : position;

  const season = await getConfigValue('season');
  const mainUserId = await getConfigValue('main_user_id');

  // 2. Rankings y promesas relacionadas
  const expertData = await getExpertData(idExpert);

  const rankingsPromise = getRankings({
    season,
    dynasty,
    scoring,
    expertData,
    position: finalPosition,
    week
  });

  const rankingsResponse = await rankingsPromise;
  const rankings = Array.isArray(rankingsResponse?.players)
    ? rankingsResponse.players
    : [];
  const ranks_published = rankingsResponse?.published ?? null;
  const source = rankingsResponse?.source ?? null;

  // DST & K con offsets (solo si el experto es fantasypros)
  let dstRankings = [];
  let kickerRankings = [];

  if (expertData?.source === 'fantasypros') {
    if (starterPositions.includes('DEF')) {
      dstRankings =
        (await getDSTRankings({
          season,
          dynasty,
          expertData,
          weekStatic: null
        }))?.players?.map(p => ({
          ...p,
          rank: (typeof p.rank === 'number' ? p.rank : 9999) + 10000
        })) || [];
    }
    if (starterPositions.includes('K')) {
      kickerRankings =
        (await getKickerRankings({
          season,
          dynasty,
          expertData,
          weekStatic: null
        }))?.players?.map(p => ({
          ...p,
          rank: (typeof p.rank === 'number' ? p.rank : 9999) + 20000
        })) || [];
    }
  }

  // 3. Roster del usuario
  const allRosters = await getRosters(leagueId);
  const myRoster = allRosters.find(r => r.owner_id === mainUserId);
  const playerIds = myRoster?.players ?? [];

  if (!playerIds || playerIds.length === 0) {
    throw new Error('Roster vacío o sin jugadores.');
  }

  // 4. Info de jugadores
  const playersData = await getPlayersData(playerIds);

  // 5. Construir arreglo de jugadores con ranking asignado
  const players = playerIds
    .map(sleeperId => {
      const info = playersData.find(p => p.player_id === String(sleeperId));
      if (!info) return null;

      const name = info.full_name;
      const isDST = info.position === 'DEF';
      const isK = info.position === 'K';
      const rankingList = isDST
        ? dstRankings
        : isK
        ? kickerRankings
        : rankings;
      const ranked = fuzzySearch(name, rankingList);

      const playerRank = ranked[0] || {};
      const rank =
        ranked.length === 0 || info.injury_status === 'Out'
          ? 9999
          : playerRank.rank;
      const matchup = playerRank.matchup || 'N/D';
      const byeWeek = playerRank.bye_week || info.bye_week || 'N/D';
      const rookie = info.years_exp === 0 ? ' (R)' : '';

      return {
        rank,
        nombre: `${info.full_name}${rookie}`,
        position: info.position,
        team: info.team,
        matchup,
        byeWeek,
        injuryStatus: info.injury_status || '',
        sleeperId
      };
    })
    .filter(Boolean);

  // 6. Ordenar por ranking
  players.sort((a, b) => a.rank - b.rank);

  // 7. Generar titulares y banca
  const [starters, bench] = generateLineup(players, starterPositions);

  return {
    success: true,
    meta: {
      scoring,
      dynasty,
      superFlex,
      published: ranks_published,
      source
    },
    starters,
    bench
  };
}

/**
 * Helper: extrae posibles player_id desde un objeto de ranking.
 * Intenta múltiples campos comunes. Coerce a string.
 */
function extractIdFromRankingObj(obj) {
  if (!obj || typeof obj !== 'object') return null;
  return (
    obj.player_id ??
    obj.playerId ??
    obj.sleeper_id ??
    obj.sleeperId ??
    obj.sleeper_player_id ??
    obj.player_id_sleeper ??
    obj.id ??
    obj.playerIdRaw ??
    null
  );
}

/**
 * Helper: extrae nombre del objeto ranking (varias fuentes usan diferentes campos)
 */
function extractNameFromRankingObj(obj) {
  if (!obj || typeof obj !== 'object') return null;
  return (
    obj.player_name ??
    obj.playerName ??
    obj.name ??
    obj.player ??
    obj.player_full_name ??
    obj.full_name ??
    null
  );
}

/**
 * getWaiversData: obtiene rankings, extrae playerIds y llama a getFreeAgents con playersData
 */
 export async function getWaiversData(
   leagueId,
   { idExpert = 3701, position = 'TODAS', week = 1 } = {}
 ) {
   try {
     // 1) Datos de liga y config
     const leagueData = await getSleeperLeague(leagueId);
     const starterPositions = getStarterPositions(leagueData);
     const superFlex = starterPositions.includes('SUPER_FLEX');

     const scoring =
       leagueData.scoring_settings?.rec >= 1
         ? 'PPR'
         : leagueData.scoring_settings?.rec === 0.5
         ? 'HALF'
         : 'STANDARD';

     const tipoLiga = await getConfigValue('dynasty');
     const dynasty = leagueData.settings.type === 2 && tipoLiga === 'LIGA';

     const finalPosition =
       superFlex && position === 'TODAS' ? 'SUPER FLEX' : position;

     const season = await getConfigValue('season');

     // 2) Experto
     const expertData = await getExpertData(idExpert);

     // 3) Rankings principales (estilo draft: con week)
     const rankingsResponse = await getRankings({
       season,
       dynasty,
       scoring,
       expertData,
       position: finalPosition,
       week
     });

     let rankings = Array.isArray(rankingsResponse?.players)
       ? rankingsResponse.players
       : [];
     const published = rankingsResponse?.published ?? null;
     const source = rankingsResponse?.source ?? null;

     console.log(`🔎 Rankings base (${finalPosition}) -> ${rankings.length} jugadores. source=${source}`);

     // 3.1) Si es fantasypros y pedimos TODAS, *ampliar cobertura* trayendo rankings por posición
     if (source === 'fantasypros' && (finalPosition === 'TODAS' || finalPosition === 'ALL')) {
       const extraPositions = ['QB', 'RB', 'WR', 'TE'];
       for (const pos of extraPositions) {
         try {
           const rpos = await getRankings({
             season,
             dynasty,
             scoring,
             expertData,
             position: pos,
             week
           });
           const arr = Array.isArray(rpos?.players) ? rpos.players : [];
           console.log(`➕ Rankings extra (${pos}) -> ${arr.length}`);
           if (arr.length) {
             // Mezclar evitando duplicados por player_name
             const seen = new Set(
               rankings.map(x => (x.player_name || x.full_name || '').toLowerCase())
             );
             for (const p of arr) {
               const key = (p.player_name || p.full_name || '').toLowerCase();
               if (key && !seen.has(key)) {
                 rankings.push(p);
                 seen.add(key);
               }
             }
           }
         } catch (err) {
           console.warn(`⚠️ No se pudo obtener rankings de posición ${pos}:`, err?.message);
         }
       }
       console.log(`📈 Rankings totales tras merge: ${rankings.length}`);
     }

     // 4) DST & Kicker
     let dstRankings = [];
     let kickerRankings = [];

     const needsDEF = starterPositions.includes('DEF');
     const needsK = starterPositions.includes('K');

     if (expertData?.source === 'fantasypros') {
       if (needsDEF) {
         dstRankings =
           (await getDSTRankings({
             season,
             dynasty,
             expertData,
             weekStatic: null
           }))?.players || [];
       }
       if (needsK) {
         kickerRankings =
           (await getKickerRankings({
             season,
             dynasty,
             expertData,
             weekStatic: null
           }))?.players || [];
       }
     }

     // -----------------------
     // EXTRAER playerIds desde rankings (si existiera algún id) y si no, fallback por nombres
     // -----------------------
     const allRankArrays = [rankings, dstRankings, kickerRankings].filter(Boolean);
     const idsSet = new Set();
     const nameCandidates = new Set();

     const extractIdFromRankingObj = (obj) => {
       if (!obj || typeof obj !== 'object') return null;
       return (
         obj.player_id ??
         obj.playerId ??
         obj.sleeper_id ??
         obj.sleeperId ??
         obj.sleeper_player_id ??
         obj.player_id_sleeper ??
         obj.id ??
         obj.playerIdRaw ??
         null
       );
     };

     const extractNameFromRankingObj = (obj) => {
       if (!obj || typeof obj !== 'object') return null;
       return (
         obj.player_name ??
         obj.playerName ??
         obj.name ??
         obj.player ??
         obj.player_full_name ??
         obj.full_name ??
         null
       );
     };

     for (const arr of allRankArrays) {
       for (const r of arr) {
         const id = extractIdFromRankingObj(r);
         if (id !== null && id !== undefined && id !== '') {
           idsSet.add(String(id));
         } else {
           const nm = extractNameFromRankingObj(r);
           if (nm) nameCandidates.add(nm);
         }
       }
     }

     console.log(`🧩 idsSet.size=${idsSet.size} | nameCandidates.size=${nameCandidates.size}`);

     let playersData = [];

     if (idsSet.size > 0) {
       const playerIds = Array.from(idsSet);
       console.log(`🎯 getPlayersData con ids: ${playerIds.length}`);
       playersData = await getPlayersData(playerIds);
     } else if (nameCandidates.size > 0) {
       const names = Array.from(nameCandidates);
       console.log(`🧾 getPlayersByNames con ${names.length} nombres (muestra: ${names.slice(0, 10).join(', ')})`);
       const found = await getPlayersByNames(names);
       playersData = Array.isArray(found) ? found : [];
       console.log(`✅ getPlayersByNames encontró: ${playersData.length}`);
     } else {
       // NO llames getPlayersData() sin ids porque tu implementación lo requiere.
       console.warn('⚠️ Sin ids ni nombres para mapear jugadores; no se puede llamar getPlayersData() sin ids.');
       playersData = [];
     }

     // 5) Free agents
     const freeAgents = await getFreeAgents(
       leagueId,
       starterPositions,
       rankings,
       dstRankings,
       kickerRankings,
       playersData
     );

     return {
       success: true,
       meta: {
         scoring,
         dynasty,
         superFlex,
         published,
         source
       },
       freeAgents
     };
   } catch (e) {
     console.error('¡ERROR! getWaiversData:', e);
     return {
       success: false,
       error: e.message || 'Error al obtener waivers'
     };
   }
 }

/**
 * getFreeAgents actualizado: ahora acepta playersData como parámetro opcional.
 * Si playersData se pasa, lo usa (evita doble fetch). Si no, cae al comportamiento previo.
 */
 export async function getFreeAgents(
   leagueId,
   starterPositions,
   rankings = [],
   dstRankings = [],
   kickerRankings = [],
   playersDataParam = null
 ) {
   try {
     console.log(`🔍 getFreeAgents iniciado para liga ${leagueId}`);

     // 1) Rosters y jugadores tomados
     const rosters = await getRosters(leagueId);
     console.log(`📋 Rosters obtenidos: ${Array.isArray(rosters) ? rosters.length : 0}`);

     const ownedSet = new Set(
       rosters.flatMap(r => (Array.isArray(r.players) ? r.players.map(String) : []))
     );
     console.log(`🛑 Jugadores ya tomados: ${ownedSet.size}`);

     // 2) Players: usar playersDataParam si viene
     if (!Array.isArray(playersDataParam) || playersDataParam.length === 0) {
       console.warn('⚠️ playersDataParam vacío; no se puede llamar getPlayersData() sin ids en tu implementación.');
       return [];
     }
     const playersData = playersDataParam;
     console.log(`📦 Usando playersDataParam con ${playersData.length} jugadores`);

     // === Helpers de normalización ===
     const normalize = (s) =>
       String(s || '')
         .normalize('NFD')
         .replace(/[\u0300-\u036f]/g, '') // quitar acentos
         .toLowerCase()
         .replace(/[.'’]/g, '')
         .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
         .replace(/\s+/g, ' ')
         .trim();

     const firstLast = (s) => {
       const parts = String(s || '').trim().split(/\s+/);
       if (parts.length === 0) return '';
       if (parts.length === 1) return normalize(parts[0]);
       return normalize(`${parts[0]} ${parts[parts.length - 1]}`);
     };

     const nameFromRank = (r) =>
       r?.player_name || r?.playerName || r?.full_name || r?.name || r?.player_full_name || '';

     // === Construir índices por nombre ===
     const buildIndex = (arr = []) => {
       const map = new Map();
       for (const r of arr) {
         const nm = nameFromRank(r);
         if (!nm) continue;
         const k1 = normalize(nm);
         const k2 = firstLast(nm);
         if (k1) map.set(k1, r);
         if (k2) map.set(k2, r);
       }
       return map;
     };

     const rankIndex = buildIndex(rankings);
     const dstIndex = buildIndex(dstRankings);
     const kIndex = buildIndex(kickerRankings);

     console.log(
       `🗂️ Índices -> main:${rankIndex.size} dst:${dstIndex.size} k:${kIndex.size}`
     );

     const lookupRank = (name, list, index) => {
       const k1 = normalize(name);
       const k2 = firstLast(name);
       // 1) intento exacto por índices
       if (index.has(k1)) return [index.get(k1)];
       if (index.has(k2)) return [index.get(k2)];
       // 2) fallback: fuzzy en la lista original
       const hit = fuzzySearch(name, list);
       return Array.isArray(hit) ? hit : [];
     };

     // 3) Filtrar pool: no tomados & posición válida
     const freeAgentsPool = playersData.filter(p => {
       const pid = String(p.player_id ?? '');
       const pos = p.position ?? null;
       return !ownedSet.has(pid) && (pos ? starterPositions.includes(pos) : false);
     });
     console.log(`✅ Free agents pool filtrado: ${freeAgentsPool.length} jugadores`);

     // 4) Construir filas
     const rows = [];

     for (const info of freeAgentsPool) {
       const fullName = info.full_name || '';
       const position = info.position || '';
       const team = info.team || '';
       const status = info.injury_status || '';
       const rookie = info.years_exp === 0 ? ' (R)' : '';

       // Ranking principal
       const faRank = lookupRank(fullName, rankings, rankIndex);
       if (Array.isArray(faRank) && faRank.length > 0) {
         const r = faRank[0];

         const posField = Array.isArray(r.player_positions)
           ? r.player_positions.join(',')
           : String(r.player_positions || '');

         // Validación de posición flexible
         const posOk = posField ? posField.includes(position) : true;

         if (posOk) {
           rows.push({
             rank: typeof r.rank === 'number' ? r.rank : parseInt(r.rank) || 9999,
             nombre: `${fullName}${rookie}`,
             position,
             team,
             matchup: r.matchup ?? 'N/D',
             byeWeek: r.bye_week ?? info.bye_week ?? 'N/D',
             status
           });
         }
       } else {
         console.log(`⚠️ No se encontró ranking main para: ${fullName} (${position})`);
       }

       // DEF (offset +10000)
       if (position === 'DEF' && dstRankings?.length) {
         const faDSTRank = lookupRank(fullName, dstRankings, dstIndex);
         if (Array.isArray(faDSTRank) && faDSTRank.length > 0) {
           const r = faDSTRank[0];
           rows.push({
             rank: 10000 + (parseInt(r.rank) || 9999),
             nombre: r.player_name || fullName,
             position: r.player_positions || position,
             team: r.player_team_id || team,
             matchup: r.matchup ?? 'N/D',
             byeWeek: r.bye_week ?? 'N/D',
             status: ''
           });
         }
       }

       // K (offset +20000)
       if (position === 'K' && kickerRankings?.length) {
         const faKRank = lookupRank(fullName, kickerRankings, kIndex);
         if (Array.isArray(faKRank) && faKRank.length > 0) {
           const r = faKRank[0];
           rows.push({
             rank: 20000 + (parseInt(r.rank) || 9999),
             nombre: `${r.player_name || fullName}${rookie}`,
             position: r.player_positions || position,
             team: r.player_team_id || team,
             matchup: r.matchup ?? 'N/D',
             byeWeek: r.bye_week ?? 'N/D',
             status: ''
           });
         }
       }
     }

     // 5) Ordenar por rank ascendente y devolver
     rows.sort((a, b) => {
       const ar = typeof a.rank === 'number' ? a.rank : parseInt(a.rank) || 9999;
       const br = typeof b.rank === 'number' ? b.rank : parseInt(b.rank) || 9999;
       return ar - br;
     });

     console.log(`📊 Filas finales construidas: ${rows.length}`);

     return rows;
   } catch (e) {
     console.error('❌ ¡ERROR en getFreeAgents:', e);
     throw new Error('Error al obtener free agents');
   }
 }
