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
   {
     idExpert = null,
     position = 'TODAS',
     week = 1,
     limits = { main: 600, dst: 64, k: 64 },
   } = {}
 ) {
   // 1) Datos de liga
   const leagueData = await getSleeperLeague(leagueId);
   const starterPositions = getStarterPositions(leagueData);
   const superFlex = starterPositions.includes('SUPER_FLEX');
   console.log('▶ starterPositions:', starterPositions);

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

   console.log('▶ Config:', { scoring, dynasty, superFlex, finalPosition, season });

   // 2) Rankings
   const expertData = await getExpertData(idExpert);
   console.log('▶ ExpertData:', expertData);

   const rankingsResponse = await getRankings({ season, dynasty, scoring, expertData, position: finalPosition, week });
   const rankings = Array.isArray(rankingsResponse?.players) ? rankingsResponse.players : [];
   console.log('▶ Rankings count:', rankings.length);

   let dstRankings = [];
   let kickerRankings = [];

   if (expertData?.source === 'fantasypros') {
     if (starterPositions.includes('DEF')) {
       dstRankings =
         (await getDSTRankings({ season, dynasty, expertData, week }))?.players?.map((p) => ({
           ...p,
           rank: (typeof p.rank === 'number' ? p.rank : 9999) + 10000,
         })) || [];
     }
     if (starterPositions.includes('K')) {
       kickerRankings =
         (await getKickerRankings({ season, dynasty, expertData, week }))?.players?.map((p) => ({
           ...p,
           rank: (typeof p.rank === 'number' ? p.rank : 9999) + 20000,
         })) || [];
     }
   }

   console.log('▶ DST count:', dstRankings.length, 'K count:', kickerRankings.length);

   // 3) Roster actual
   const allRosters = await getRosters(leagueId);
   const playersOwned = new Set();
   for (const r of allRosters || []) {
     if (Array.isArray(r?.players)) {
       for (const pid of r.players) playersOwned.add(String(pid));
     }
   }
   console.log('▶ Owned players:', playersOwned.size);

   // 4) Armar lista de nombres candidatos
   const pickName = (r) =>
     r?.player_name || r?.name || r?.player || r?.player_full_name || r?.playerName || r?.player_name_text || '';

   const uniqueLower = (arr) => Array.from(new Set(arr.map((s) => s?.toLowerCase?.() || ''))).filter(Boolean);

   const mainNames = uniqueLower(rankings.slice(0, limits.main).map(pickName));
   const dstNames = uniqueLower(dstRankings.slice(0, limits.dst).map(pickName));
   const kNames = uniqueLower(kickerRankings.slice(0, limits.k).map(pickName));

   const allNamesLower = Array.from(new Set([...mainNames, ...dstNames, ...kNames]));
   console.log('▶ allNamesLower count:', allNamesLower.length, 'sample:', allNamesLower.slice(0, 10));

   // 5) Resolver metadata desde tu base
   const playersInfo = await getPlayersByNames(allNamesLower);
   console.log('▶ playersInfo count:', playersInfo?.length || 0);

   const infoByName = new Map();
   for (const p of playersInfo || []) {
     const nameLower = (p?.full_name || p?.name || '').toLowerCase();
     if (!nameLower) continue;
     const curr = infoByName.get(nameLower);
     if (!curr || (p?.player_id && !curr?.player_id)) infoByName.set(nameLower, p);
   }
   console.log('▶ infoByName keys:', infoByName.size);

   // 6) Construcción de candidatos
   const allowedPositions = new Set(starterPositions.map((s) => s.replace('SUPER_', '')));
   const isAllowedPosition = (pos) => {
     const P = String(pos || '').toUpperCase();
     if (P === 'DL' || P === 'LB' || P === 'DB' || P === 'IDP') return false;
     if (allowedPositions.has(P)) return true;
     if (superFlex && (P === 'QB' || P === 'RB' || P === 'WR' || P === 'TE')) return true;
     if (allowedPositions.has('FLEX') && (P === 'RB' || P === 'WR' || P === 'TE')) return true;
     return false;
   };

   const candidates = [];
   for (const [nameLower, info] of infoByName.entries()) {
     const sleeperId = String(info.player_id || '');
     const pos = String(info.position || '').toUpperCase();

     if (!isAllowedPosition(pos)) continue;
     if (sleeperId && playersOwned.has(sleeperId)) continue;

     const rankingList = pos === 'DEF' ? dstRankings : pos === 'K' ? kickerRankings : rankings;
     const ranked = fuzzySearch(info.full_name || info.name, rankingList);
     const playerRank = ranked?.[0] || {};

     const rank =
       !ranked?.length || String(info.injury_status || '').toLowerCase() === 'out' ? 9999 : playerRank.rank;
     const rookie = info.years_exp === 0 ? ' (R)' : '';

     candidates.push({
       rank,
       nombre: `${info.full_name || info.name}${rookie}`,
       position: pos,
       team: info.team || playerRank.player_team_id || 'FA',
       matchup: playerRank.matchup || 'N/D',
       byeWeek: playerRank.bye_week || info.bye_week || 'N/D',
       injuryStatus: info.injury_status || '',
       sleeperId: sleeperId || null,
     });
   }
   console.log('▶ candidates count:', candidates.length);

   // 7) Orden y deduplicación
   candidates.sort((a, b) => a.rank - b.rank);
   const seen = new Set();
   const freeAgents = [];
   for (const p of candidates) {
     const key = p.sleeperId || `${p.nombre.toLowerCase()}|${p.position}`;
     if (seen.has(key)) continue;
     seen.add(key);
     freeAgents.push(p);
   }
   console.log('▶ freeAgents final count:', freeAgents.length);

   return {
     success: true,
     meta: { scoring, dynasty, superFlex, published: rankingsResponse?.published ?? null, source },
     freeAgents,
   };
 }
