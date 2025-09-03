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
    // Limitar cuántos nombres por fuente intentamos resolver (protege de listas enormes)
    limits = { main: 600, dst: 64, k: 64 },
  } = {}
) {
  // 1) Datos base de liga y ajustes
  const leagueData = await getSleeperLeague(leagueId);
  const starterPositions = getStarterPositions(leagueData); // p.ej. ["QB","RB","RB","WR","WR","FLEX","FLEX", ...]
  const superFlex = starterPositions.includes('SUPER_FLEX');

  const scoring =
    leagueData.scoring_settings?.rec === 1
      ? 'PPR'
      : leagueData.scoring_settings?.rec === 0.5
      ? 'HALF'
      : 'STANDARD';

  const tipoLiga = await getConfigValue('dynasty');
  const dynasty = leagueData.settings.type === 2 && tipoLiga === 'LIGA';

  const finalPosition = superFlex && position === 'TODAS' ? 'SUPER FLEX' : position; // misma lógica que getLineupData

  const season = await getConfigValue('season');

  // 2) Experto y rankings
  const expertData = await getExpertData(idExpert);

  const rankingsResponse = await getRankings({
    season,
    dynasty,
    scoring,
    expertData,
    position: finalPosition,
    week,
  });

  const rankings = Array.isArray(rankingsResponse?.players) ? rankingsResponse.players : [];
  const ranks_published = rankingsResponse?.published ?? null;
  const source = rankingsResponse?.source ?? null;

  // DST y K con offsets solo si el experto es fantasypros (coincide con getLineupData)
  let dstRankings = [];
  let kickerRankings = [];

  if (expertData?.source === 'fantasypros') {
    if (starterPositions.includes('DEF')) {
      dstRankings =
        (await getDSTRankings({ season, dynasty, expertData, week }))?.players?.map((p) => ({
          ...p,
          rank: (typeof p.rank === 'number' ? p.rank : 9999) + 10000, // offset DEF
        })) || [];
    }
    if (starterPositions.includes('K')) {
      kickerRankings =
        (await getKickerRankings({ season, dynasty, expertData, week }))?.players?.map((p) => ({
          ...p,
          rank: (typeof p.rank === 'number' ? p.rank : 9999) + 20000, // offset K
        })) || [];
    }
  }

  // 3) Jugadores ya tomados (todas las plantillas de la liga)
  const allRosters = await getRosters(leagueId);
  const playersOwned = new Set();
  for (const r of allRosters || []) {
    if (Array.isArray(r?.players)) {
      for (const pid of r.players) playersOwned.add(String(pid));
    }
  }

  // 4) Resolver candidatos a FA a partir de nombres en los rankings
  //    (evita depender de una tabla full de players si no está disponible aquí)
  const pickName = (r) =>
    r?.player_name || r?.name || r?.player || r?.player_full_name || r?.playerName || r?.player_name_text || '';

  const uniqueLower = (arr) => Array.from(new Set(arr.map((s) => s?.toLowerCase?.() || ''))).filter(Boolean);

  const mainNames = uniqueLower(rankings.slice(0, limits.main).map(pickName));
  const dstNames = uniqueLower(dstRankings.slice(0, limits.dst).map(pickName));
  const kNames = uniqueLower(kickerRankings.slice(0, limits.k).map(pickName));

  const allNamesLower = Array.from(new Set([...mainNames, ...dstNames, ...kNames]));

  // Intentamos recuperar la metadata de estos jugadores desde tu base (Supabase) mediante nombres
  // getPlayersByNames debe aceptar una lista de nombres (case-insensitive idealmente)
  const playersInfo = await getPlayersByNames(allNamesLower);

  // Normalizamos un mapa nameLower -> info (preferimos info con sleeperId)
  const infoByName = new Map();
  for (const p of playersInfo || []) {
    const nameLower = (p?.full_name || p?.name || '').toLowerCase();
    if (!nameLower) continue;
    const curr = infoByName.get(nameLower);
    // Si hay duplicados, prioriza el que tenga sleeperId
    if (!curr || (p?.player_id && !curr?.player_id)) infoByName.set(nameLower, p);
  }

  // 5) Filtrar: no owned + posición válida según los starters de la liga
  //    Luego asignar ranking (usamos fuzzySearch contra el conjunto correcto de rankings)
  const allowedPositions = new Set(starterPositions.map((s) => s.replace('SUPER_', ''))); // e.g., SUPER_FLEX => FLEX lógica: permitimos QB/RB/WR/TE/K/DEF

  const isAllowedPosition = (pos) => {
    const P = String(pos || '').toUpperCase();
    if (P === 'DL' || P === 'LB' || P === 'DB' || P === 'IDP') return false; // por si tu dataset tiene IDPs; no soportado aquí
    if (allowedPositions.has(P)) return true;
    // Si la liga tiene FLEX/SUPER_FLEX, aceptamos QB/RB/WR/TE también
    if (superFlex && (P === 'QB' || P === 'RB' || P === 'WR' || P === 'TE')) return true;
    if (allowedPositions.has('FLEX') && (P === 'RB' || P === 'WR' || P === 'TE')) return true;
    return false;
  };

  const candidates = [];

  for (const [nameLower, info] of infoByName.entries()) {
    if (!info) continue;

    const sleeperId = String(info.player_id || '');
    const pos = String(info.position || '').toUpperCase();
    if (!isAllowedPosition(pos)) continue;

    if (sleeperId && playersOwned.has(sleeperId)) continue; // ya tomado

    // Determinar de cuál lista tomar el ranking (DEF/K listas ya traen offset)
    const rankingList = pos === 'DEF' ? dstRankings : pos === 'K' ? kickerRankings : rankings;

    // fuzzy contra nombres del ranking
    const ranked = fuzzySearch(info.full_name || info.name, rankingList);

    const playerRank = ranked?.[0] || {};

    // Reglas de rank similares a getLineupData
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

  // 6) Ordenar por ranking ascendente y deduplicar por sleeperId/nombre
  candidates.sort((a, b) => a.rank - b.rank);

  const seen = new Set();
  const freeAgents = [];
  for (const p of candidates) {
    const key = p.sleeperId || `${p.nombre.toLowerCase()}|${p.position}`;
    if (seen.has(key)) continue;
    seen.add(key);
    freeAgents.push(p);
  }

  return {
    success: true,
    meta: {
      scoring,
      dynasty,
      superFlex,
      published: ranks_published,
      source,
    },
    freeAgents,
  };
}
