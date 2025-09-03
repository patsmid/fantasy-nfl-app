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
 export async function getFreeAgentsData(leagueId, { idExpert = null, position = 'TODAS', week = 1 } = {}) {
   // 1. Datos de la liga y configuración
   const leagueData = await getSleeperLeague(leagueId);
   const starterPositions = getStarterPositions(leagueData);

   const scoring =
     leagueData.scoring_settings?.rec === 1
       ? 'PPR'
       : leagueData.scoring_settings?.rec === 0.5
       ? 'HALF'
       : 'STANDARD';

   const season = await getConfigValue('season');
   const expertData = await getExpertData(idExpert);

   // 2. Rankings principales
   const rankingsResponse = await getRankings({
     season,
     scoring,
     expertData,
     position,
     week
   });

   const rankings = Array.isArray(rankingsResponse?.players)
     ? rankingsResponse.players
     : [];

   // DST & K con offsets (solo si es fantasypros)
   let dstRankings = [];
   let kickerRankings = [];

   if (expertData?.source === 'fantasypros') {
     if (starterPositions.includes('DEF')) {
       dstRankings =
         (await getDSTRankings({ season, expertData, week }))?.players?.map(p => ({
           ...p,
           rank: (typeof p.rank === 'number' ? p.rank : 9999) + 10000
         })) || [];
     }
     if (starterPositions.includes('K')) {
       kickerRankings =
         (await getKickerRankings({ season, expertData, week }))?.players?.map(p => ({
           ...p,
           rank: (typeof p.rank === 'number' ? p.rank : 9999) + 20000
         })) || [];
     }
   }

   // 3. Todos los jugadores de la DB (supabase)
   const { data: allPlayersFromDB, error } = await supabase
     .from('players')
     .select('*');

   if (error) {
     throw new Error(`Error cargando jugadores: ${error.message}`);
   }

   // 4. Construcción de free agents con filtro
   const freeAgents = allPlayersFromDB
     .map(info => {
       const name = info.full_name;
       const isDST = info.position === 'DEF';
       const isK = info.position === 'K';

       const rankingList = isDST
         ? dstRankings
         : isK
         ? kickerRankings
         : rankings;

       const ranked = fuzzySearch(name, rankingList);

       if (!ranked || ranked.length === 0) {
         // 🔴 No hay coincidencia -> no incluir
         return null;
       }

       const playerRank = ranked[0];

       return {
         rank: playerRank.rank,
         nombre: info.full_name,
         position: info.position,
         team: info.team,
         matchup: playerRank.matchup || 'N/D',
         byeWeek: playerRank.bye_week || info.bye_week || 'N/D',
         injuryStatus: info.injury_status || '',
         sleeperId: info.player_id
       };
     })
     .filter(Boolean) // 🔴 Solo jugadores con ranking válido
     .sort((a, b) => a.rank - b.rank);

   return {
     success: true,
     freeAgents
   };
 }

function isAllowedPosition(pos, starterPositions, superFlex) {
  const allowedPositions = new Set(starterPositions.map(s => s.replace('SUPER_', '')));
  if (['DL', 'LB', 'DB', 'IDP'].includes(pos)) return false;
  if (allowedPositions.has(pos)) return true;
  if (superFlex && ['QB', 'RB', 'WR', 'TE'].includes(pos)) return true;
  if (allowedPositions.has('FLEX') && ['RB', 'WR', 'TE'].includes(pos)) return true;
  return false;
}
