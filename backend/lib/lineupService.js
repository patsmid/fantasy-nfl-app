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
          week
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
          week
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
 * Genera el listado de agentes libres (waivers) para una liga de Sleeper,
 * ordenados por ranking del experto seleccionado. Sigue la misma lógica y
 * dependencias que getLineupData, para ser consistente con tu stack actual.
 *
 * Campos devueltos por cada jugador:
 *  - rank: número de ranking (DST/K con offset si aplica)
 *  - nombre: "Full Name (R)" si es novato
 *  - position: posición (QB/RB/WR/TE/K/DEF)
 *  - team: equipo (por ej. KC)
 *  - matchup: abreviatura del enfrentamiento (si el origen lo provee)
 *  - byeWeek: semana de descanso
 *  - injuryStatus: estado de lesión ("Out", "Questionable", etc)
 *  - sleeperId: id de Sleeper si se pudo resolver
 */
 export async function getFreeAgentsData(
   leagueId,
   { idExpert = null, position = 'TODAS', week = 1 } = {}
 ) {
   // 1) Liga y configuración
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
   const season = await getConfigValue('season');

   // Igual que en lineup: si es superflex y pidieron TODAS, pedimos SUPER FLEX a la fuente
   const finalPosition = superFlex && position === 'TODAS' ? 'SUPER FLEX' : position;

   console.log('▶ starterPositions:', starterPositions);
   console.log('▶ Config:', { scoring, dynasty, superFlex, finalPosition, season });

   // 2) Experto y rankings
   const expertData = await getExpertData(idExpert);
   console.log('▶ ExpertData:', expertData);

   const rankingsResponse = await getRankings({
     season,
     dynasty,
     scoring,
     expertData,
     position: finalPosition,
     week
   });

   const rankings = Array.isArray(rankingsResponse?.players) ? rankingsResponse.players : [];
   const ranks_published = rankingsResponse?.published ?? null;
   const source = rankingsResponse?.source ?? null;

   console.log('▶ Rankings main count:', rankings.length);

   // DST & K con offsets (solo si FP + si la liga usa esas posiciones)
   let dstRankings = [];
   let kickerRankings = [];

   if (expertData?.source === 'fantasypros') {
     if (starterPositions.includes('DEF')) {
       dstRankings =
         (await getDSTRankings({ season, dynasty, expertData, week }))?.players?.map(p => ({
           ...p,
           rank: (typeof p.rank === 'number' ? p.rank : 9999) + 10000
         })) || [];
     }
     if (starterPositions.includes('K')) {
       kickerRankings =
         (await getKickerRankings({ season, dynasty, expertData, week }))?.players?.map(p => ({
           ...p,
           rank: (typeof p.rank === 'number' ? p.rank : 9999) + 20000
         })) || [];
     }
   }

   console.log('▶ DST count:', dstRankings.length, 'K count:', kickerRankings.length);

   // 3) Jugadores ocupados en la liga
   const allRosters = await getRosters(leagueId);
   const ownedSet = new Set();
   for (const r of allRosters || []) {
     if (Array.isArray(r?.players)) {
       for (const pid of r.players) ownedSet.add(String(pid));
     }
   }
   console.log('▶ Owned players:', ownedSet.size);

   // 4) Traer base de jugadores (chunked en tu getPlayersData ya modificado)
   const allPlayers = await getPlayersData(); // trae todos (10k+)
   console.log('▶ total players in DB:', allPlayers.length);

   // 5) Construir FA: no owned + posición válida + match estricto en rankings
   const byIdBest = new Map(); // sleeperId -> { ...player, rank } (mejor rank)

   for (const info of allPlayers) {
     const sleeperId = String(info.player_id || '');
     const pos = String(info.position || '').toUpperCase();

     // fuera si: sin id, está ocupado, o posición no válida para tu liga
     if (!sleeperId || ownedSet.has(sleeperId)) continue;
     if (!isAllowedPosition(pos, starterPositions, superFlex)) continue;

     const isDST = pos === 'DEF';
     const isK = pos === 'K';
     const rankingList = isDST ? dstRankings : isK ? kickerRankings : rankings;

     if (!Array.isArray(rankingList) || rankingList.length === 0) continue;

     const ranked = fuzzySearch(info.full_name, rankingList);
     if (!ranked || ranked.length === 0) continue;

     const top = ranked[0] || {};
     // 🚧 Validaciones extra para evitar falsos positivos:
     // - Si trae posición en el ranking, debe coincidir con la del jugador (como en GAS)
     if (top.player_positions && String(top.player_positions).toUpperCase() !== pos) {
       continue;
     }
     // - Chequeo de nombre "estricto": apellido debe coincidir, y el primer nombre o inicial también
     if (top.player_name && !namesLikelySame(info.full_name, top.player_name)) {
       continue;
     }

     const rankVal = typeof top.rank === 'number' ? top.rank : Number(top.rank);
     if (!Number.isFinite(rankVal)) continue;

     const rookie = info.years_exp === 0 ? ' (R)' : '';

     const candidate = {
       rank: rankVal,
       nombre: `${info.full_name}${rookie}`,
       position: pos,
       team: info.team || top.player_team_id || 'FA',
       matchup: top.matchup || 'N/D',
       byeWeek: top.bye_week || info.bye_week || 'N/D',
       injuryStatus: info.injury_status || '',
       sleeperId
     };

     // Dedup por sleeperId: conservar el de mejor rank
     const prev = byIdBest.get(sleeperId);
     if (!prev || rankVal < prev.rank) byIdBest.set(sleeperId, candidate);
   }

   const freeAgents = Array.from(byIdBest.values()).sort((a, b) => a.rank - b.rank);
   console.log('▶ freeAgents final count:', freeAgents.length);

   return {
     success: true,
     meta: { scoring, dynasty, superFlex, published: ranks_published, source },
     freeAgents
   };
 }

 /** Igual a la intención de GAS: solo posiciones que puede alinear tu liga */
 function isAllowedPosition(pos, starterPositions, superFlex) {
   const P = String(pos || '').toUpperCase();
   // Excluir IDP explícitamente
   const IDP = new Set(['DL', 'DE', 'DT', 'LB', 'MLB', 'OLB', 'CB', 'DB', 'S', 'FS', 'SS', 'IDP']);
   if (IDP.has(P)) return false;

   const slots = new Set(starterPositions.map(s => String(s).toUpperCase()));

   // Si la liga tiene la posición exacta como slot, listo
   if (slots.has(P)) return true;

   // Flex lógicos
   if (slots.has('FLEX') && (P === 'RB' || P === 'WR' || P === 'TE')) return true;
   if (superFlex && (P === 'QB' || P === 'RB' || P === 'WR' || P === 'TE')) return true;

   return false;
 }

 /** Normaliza y compara nombres para reducir falsos positivos de fuzzy */
 function namesLikelySame(a, b) {
   const na = normalizeName(a);
   const nb = normalizeName(b);
   if (!na || !nb) return false;
   const [af, ...ar] = na.split(' ');
   const [bf, ...br] = nb.split(' ');

   const alast = ar.length ? ar[ar.length - 1] : af;
   const blast = br.length ? br[br.length - 1] : bf;

   // Apellido igual
   if (alast !== blast) return false;

   // Mismo nombre o inicial coincide
   if (af === bf) return true;
   if (af[0] && bf[0] && af[0] === bf[0]) return true;

   // Permitir coincidencia si uno contiene al otro (ej. "Marvin Harrison Jr" vs "Marvin Harrison")
   if (na.includes(nb) || nb.includes(na)) return true;

   return false;
 }

 function normalizeName(s) {
   return String(s || '')
     .toLowerCase()
     .replace(/\./g, ' ')
     .replace(/'/g, '')
     .replace(/-/g, ' ')
     .replace(/\bjr\b|\bsr\b|\bii\b|\biii\b|\biv\b/g, '') // quitar sufijos comunes
     .replace(/\s+/g, ' ')
     .trim();
 }
