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
 * Obtiene waivers (free agents) para una liga — replica de tu GAS: waivers()
 */
export async function getWaiversData(
  leagueId,
  { idExpert = null, position = 'TODAS', week = 1 } = {}
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

    const rankings = Array.isArray(rankingsResponse?.players)
      ? rankingsResponse.players
      : [];
    const published = rankingsResponse?.published ?? null;
    const source = rankingsResponse?.source ?? null;

    // 4) DST & Kicker (como en tu GAS: llamabas siempre a esas funciones)
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

    // 5) Free agents (replica de tu GAS: offsets aplicados aquí)
    const freeAgents = await getFreeAgents(
      leagueId,
      starterPositions,
      rankings,
      dstRankings,
      kickerRankings
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

    const rankings = Array.isArray(rankingsResponse?.players)
      ? rankingsResponse.players
      : [];
    const published = rankingsResponse?.published ?? null;
    const source = rankingsResponse?.source ?? null;

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
    // EXTRAER playerIds desde todos los rankings (rankings, dstRankings, kickerRankings)
    // -----------------------
    const allRankArrays = [rankings, dstRankings, kickerRankings].filter(Boolean);
    const idsSet = new Set();
    const nameCandidates = new Set();

    for (const arr of allRankArrays) {
      for (const r of arr) {
        const id = extractIdFromRankingObj(r);
        if (id !== null && id !== undefined && id !== '') {
          idsSet.add(String(id));
        } else {
          // si no hay id, colecciono candidato de nombre para fallback
          const nm = extractNameFromRankingObj(r);
          if (nm) nameCandidates.add(nm);
        }
      }
    }

    let playersData = [];

    if (idsSet.size > 0) {
      const playerIds = Array.from(idsSet);
      playersData = await getPlayersData(playerIds);
    } else if (nameCandidates.size > 0) {
      // fallback: buscar por nombres exactos en la tabla players
      const names = Array.from(nameCandidates);
      const found = await getPlayersByNames(names); // retorna players que coincidan exactamente por full_name
      if (Array.isArray(found) && found.length > 0) {
        playersData = found;
      } else {
        // último fallback: pedir todos los players (behaviour seguro)
        playersData = await getPlayersData();
      }
    } else {
      // no ids ni nombres -> pedir todos los players
      playersData = await getPlayersData();
    }

    // 5) Free agents (ahora pasamos playersData para que NO vuelva a pedir toda la tabla)
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

     // 2) Obtener players: usar playersDataParam si viene, si no pedir todos
     let playersData;
     if (Array.isArray(playersDataParam) && playersDataParam.length > 0) {
       playersData = playersDataParam;
       console.log(`📦 Usando playersDataParam con ${playersData.length} jugadores`);
     } else {
       playersData = (await getPlayersData()) || [];
       console.log(`📦 PlayersData obtenido desde supabase: ${playersData.length} jugadores`);
     }

     // 3) Filtrar pool: no tomados & posición válida
     const freeAgentsPool = playersData.filter(p => {
       const pid = String(p.player_id ?? '');
       const pos = p.position ?? null;
       return !ownedSet.has(pid) && (pos ? starterPositions.includes(pos) : false);
     });
     console.log(`✅ Free agents pool filtrado: ${freeAgentsPool.length} jugadores`);

     // 4) Construir filas (igual que tu GAS)
     const rows = [];

     for (const info of freeAgentsPool) {
       const fullName = info.full_name || '';
       const position = info.position || '';
       const team = info.team || '';
       const status = info.injury_status || '';
       const rookie = info.years_exp === 0 ? ' (R)' : '';

       // Ranking principal (nombre -> rankings)
       const faRank = fuzzySearch(fullName, rankings);
       if (
         Array.isArray(faRank) &&
         faRank.length > 0 &&
         (
           (typeof faRank[0].player_positions === 'string' &&
             faRank[0].player_positions === position) ||
           (Array.isArray(faRank[0].player_positions) &&
             faRank[0].player_positions.includes(position))
         )
       ) {
         rows.push({
           rank: typeof faRank[0].rank === 'number' ? faRank[0].rank : parseInt(faRank[0].rank) || 9999,
           nombre: `${fullName}${rookie}`,
           position,
           team,
           matchup: faRank[0].matchup ?? 'N/D',
           byeWeek: faRank[0].bye_week ?? info.bye_week ?? 'N/D',
           status
         });
       }

       // DEF
       if (position === 'DEF' && Array.isArray(dstRankings) && dstRankings.length > 0) {
         const faDSTRank = fuzzySearch(fullName, dstRankings);
         if (Array.isArray(faDSTRank) && faDSTRank.length > 0) {
           rows.push({
             rank: 10000 + (parseInt(faDSTRank[0].rank) || 9999),
             nombre: faDSTRank[0].player_name,
             position: faDSTRank[0].player_positions,
             team: faDSTRank[0].player_team_id,
             matchup: faDSTRank[0].matchup ?? 'N/D',
             byeWeek: faDSTRank[0].bye_week ?? 'N/D',
             status: ''
           });
         }
       }

       // K
       if (position === 'K' && Array.isArray(kickerRankings) && kickerRankings.length > 0) {
         const faKRank = fuzzySearch(fullName, kickerRankings);
         if (Array.isArray(faKRank) && faKRank.length > 0) {
           rows.push({
             rank: 20000 + (parseInt(faKRank[0].rank) || 9999),
             nombre: `${faKRank[0].player_name}${rookie}`,
             position: faKRank[0].player_positions,
             team: faKRank[0].player_team_id,
             matchup: faKRank[0].matchup ?? 'N/D',
             byeWeek: faKRank[0].bye_week ?? 'N/D',
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
