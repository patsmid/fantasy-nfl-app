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

  // 5) Construir FA: no owned + posición válida + match (incluye checks especiales para DST/K)
  const byIdBest = new Map(); // sleeperId -> candidate (con mejor rank)

  for (const info of allPlayers) {
    const sleeperId = String(info.player_id || '');
    const pos = String((info.position || '')).toUpperCase();

    if (!sleeperId || ownedSet.has(sleeperId)) continue; // ya ocupado
    if (!isAllowedPosition(pos, starterPositions, superFlex)) continue;

    // Realizamos las tres búsquedas como hacía tu GAS
		console.log('dstRankings:');
		console.log(dstRankings);
		const mainRanked = Array.isArray(rankings) && rankings.length ? fuzzySearch(info.full_name, rankings) : [];
    const dstRanked = Array.isArray(dstRankings) && dstRankings.length ? fuzzySearch(info.full_name, dstRankings) : [];
		console.log('dstRanked:');
		console.log(dstRanked);
    const kRanked = Array.isArray(kickerRankings) && kickerRankings.length ? fuzzySearch(info.full_name, kickerRankings) : [];

    // 1) Intentamos match principal (para jugadores ofensivos y TE/QB/RB/WR)
    let chosenTop = null;
    let chosenSource = null;

    if (mainRanked && mainRanked.length > 0) {
      const top = mainRanked[0];
      // Reproducir la validación GAS: si ranking trae posición, debe coincidir
      if (!top.player_positions || String(top.player_positions).toUpperCase() === pos) {
        // Validación de nombre para evitar falsos positivos en ofensivos
        if (!top.player_name || namesLikelySame(info.full_name, top.player_name)) {
          chosenTop = top;
          chosenSource = 'main';
        }
      }
    }

    // 2) Si no encontramos aceptable en main o si es DEF/K, mirar DST
    if (!chosenTop && dstRanked && dstRanked.length > 0) {
      // En GAS se añadía DST sin validar posiciones estrictas -> replicamos eso
      chosenTop = dstRanked[0];
      chosenSource = 'dst';
    }

    // 3) Si aún nada, mirar K
    if (!chosenTop && kRanked && kRanked.length > 0) {
      chosenTop = kRanked[0];
      chosenSource = 'k';
    }

    if (!chosenTop) continue; // no hay match en ninguna lista

    const top = chosenTop;
    // rank ya incluye offset para dst/k (los arrays dstRankings/kickerRankings fueron mapeados con +10000/+20000)
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

    // Dedup por sleeperId: conservar el de mejor rank (menor número)
    const prev = byIdBest.get(sleeperId);
    if (!prev || candidate.rank < prev.rank) byIdBest.set(sleeperId, candidate);
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

/** Normaliza y compara nombres para reducir falsos positivos de fuzzy en jugadores ofensivos */
function namesLikelySame(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  const [af, ...ar] = na.split(' ');
  const [bf, ...br] = nb.split(' ');

  const alast = ar.length ? ar[ar.length - 1] : af;
  const blast = br.length ? br[br.length - 1] : bf;

  if (alast !== blast) return false;

  if (af === bf) return true;
  if (af[0] && bf[0] && af[0] === bf[0]) return true;

  if (na.includes(nb) || nb.includes(na)) return true;

  return false;
}

function normalizeName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\./g, ' ')
    .replace(/['’]/g, '')
    .replace(/-/g, ' ')
    .replace(/\bjr\b|\bsr\b|\bii\b|\biii\b|\biv\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
