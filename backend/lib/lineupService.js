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
  // 1. Datos de liga
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

  // 2. Rankings
  const expertData = await getExpertData(idExpert);
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

  // DST & K
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

  // 3. Roster actuales → IDs ocupados
  const allRosters = await getRosters(leagueId);
  const playersOwned = new Set();
  for (const r of allRosters || []) {
    for (const pid of r.players || []) playersOwned.add(String(pid));
  }

  // 4. Todos los jugadores (mejor que por nombre)
  // ⚠️ Ojo: aquí puedes limitar por posición si tu tabla es grande
  const allPlayers = await getPlayersData(); // sin parámetro = trae todos
  console.log('▶ total players in DB:', allPlayers.length);

  // 5. Filtrar FA
  const candidates = [];
  for (const info of allPlayers) {
    const sleeperId = String(info.player_id || '');
    const pos = String(info.position || '').toUpperCase();

    if (!sleeperId || playersOwned.has(sleeperId)) continue; // ya tomado
    if (!isAllowedPosition(pos, starterPositions, superFlex)) continue;

    const isDST = pos === 'DEF';
    const isK = pos === 'K';
    const rankingList = isDST ? dstRankings : isK ? kickerRankings : rankings;

    const ranked = fuzzySearch(info.full_name, rankingList);
    const playerRank = ranked[0] || {};
    const rank = ranked.length === 0 || info.injury_status === 'Out' ? 9999 : playerRank.rank;

    const rookie = info.years_exp === 0 ? ' (R)' : '';

    candidates.push({
      rank,
      nombre: `${info.full_name}${rookie}`,
      position: pos,
      team: info.team || playerRank.player_team_id || 'FA',
      matchup: playerRank.matchup || 'N/D',
      byeWeek: playerRank.bye_week || info.bye_week || 'N/D',
      injuryStatus: info.injury_status || '',
      sleeperId
    });
  }

  // 6. Ordenar y deduplicar
  candidates.sort((a, b) => a.rank - b.rank);
  const seen = new Set();
  const freeAgents = [];
  for (const p of candidates) {
    if (seen.has(p.sleeperId)) continue;
    seen.add(p.sleeperId);
    freeAgents.push(p);
  }

  return {
    success: true,
    meta: { scoring, dynasty, superFlex, published: ranks_published, source },
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
