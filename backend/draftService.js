// draftService.fixed.js
import {
  getConfigValue,
  getDraftPicks,
  getADPData,
  getPlayersData,
  getMainUserDraft
} from './lib/draftUtils.js';
import { getRankings, getDSTRankings, getKickerRankings } from './lib/rankingsService.js';
import { getSleeperLeague } from './utils/sleeper.js';
import { getFantasyProsADPDataSimple } from './lib/fantasyprosService.js';
import { getAllPlayersProjectedTotals } from './lib/projectionsService.js';
import { addEstimatedStdDev, calculateVORandDropoffPro } from './lib/vorUtils.js';
import { buildFinalPlayers } from './lib/transformPlayers.js';
import { getStarterPositions, getADPtype } from './utils/helpers.js';
import { getExpertData } from './experts.js';

const toId = id => (id == null ? null : String(id));

// Normaliza registros ADP (intenta sacar sleeper_player_id de distintos shapes)
function normalizeADPRecords(adpArray = [], source = 'unknown') {
  if (!Array.isArray(adpArray)) return [];
  return adpArray.map(r => {
    // varios posibles campos donde puede venir la referencia al sleeper id
    const sleeper_player_id =
      r?.sleeper_player_id ??
      r?.player_id ??
      r?.sleeper_id ??
      r?.id ??
      r?.sleeperPlayerId ??
      null;

    const date = r?.date ?? r?.adp_date ?? r?.date_pulled ?? null;

    const adp_rank = r?.adp_rank ?? r?.adp ?? r?.rank ?? r?.adp_value ?? null;

    return {
      raw: r,
      sleeper_player_id: sleeper_player_id ? String(sleeper_player_id) : null,
      adp_rank,
      date,
      source
    };
  });
}

function getLatestDateFromADP(normalizedAdp) {
  if (!normalizedAdp || normalizedAdp.length === 0) return null;
  // buscar la fecha más reciente (suponiendo ISO strings o yyyy-mm-dd)
  const dates = normalizedAdp.map(a => (a.date ? new Date(a.date) : null)).filter(Boolean);
  if (dates.length === 0) return null;
  const latest = new Date(Math.max(...dates.map(d => d.getTime())));
  return latest.toISOString().split('T')[0];
}

export async function getDraftData(
  leagueId,
  { position = 'TODAS', byeCondition = 0, idExpert = 3701 } = {}
) {
  try {
    // 1. Datos base (paralelo)
    const [
      leagueData,
      season,
      mainUserId,
      tipoLiga
    ] = await Promise.all([
      getSleeperLeague(leagueId),
      getConfigValue('season'),
      getConfigValue('main_user_id'),
      getConfigValue('dynasty')
    ]);

    const numTeams = leagueData?.settings?.num_teams ?? 10;
    const starterPositions = getStarterPositions(leagueData);
    const superFlex = starterPositions.includes('SUPER_FLEX');
    const dynasty = leagueData.settings?.type === 2 && tipoLiga === 'LIGA';

    const scoring =
      leagueData.scoring_settings?.rec === 1
        ? 'PPR'
        : leagueData.scoring_settings?.rec === 0.5
        ? 'HALF'
        : 'STANDARD';

    // allow position param in several formats for SUPER FLEX
    let finalPosition = position;
    if (superFlex && (position === true || position === 'SUPER' || position === 'SUPER_FLEX' || position === 'SUPER FLEX')) {
      finalPosition = 'SUPER FLEX';
    }

    // 2. Rankings + proyecciones (paralelizar lo posible)
    const expertData = await getExpertData(idExpert);
    const rankingsPromise = getRankings({
      season,
      dynasty,
      scoring,
      expertData,
      position: finalPosition
    });

    // getAllPlayersProjectedTotals es costoso; lanzarlo YA en paralelo
    const projectionsPromise = getAllPlayersProjectedTotals(leagueId);

    const draftedPromise = leagueData.draft_id ? getDraftPicks(leagueData.draft_id) : Promise.resolve([]);

    const rankingsResponse = await rankingsPromise;
    const rankings = Array.isArray(rankingsResponse?.players) ? rankingsResponse.players : [];
    const ranks_published = rankingsResponse?.published ?? null;
    const source = rankingsResponse?.source ?? null;

    // 3. dst & kicker (si aplica)
    let dstRankings = [];
    let kickerRankings = [];

    if (expertData?.source !== 'flock') {
      if (starterPositions.includes('DEF')) {
        dstRankings = (await getDSTRankings({
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
        kickerRankings = (await getKickerRankings({
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

    // 4. ADP: decide fuente y normaliza
    const adpType = getADPtype(scoring, dynasty, superFlex); // tu helper
    const sleeperADP = false; // si lo usas dinámicamente, pásalo como flag
    let rawAdpData = [];
    if (dynasty || superFlex || sleeperADP) {
      rawAdpData = (await getADPData(adpType)) || [];
    } else {
      const adp_type = scoring === 'PPR'
        ? 'FP_ppr'
        : scoring === 'HALF'
        ? 'FP_half-ppr'
        : 'FP_ppr';

      rawAdpData = (await getFantasyProsADPDataSimple({ adp_type })) || [];
    }
    const normalizedAdp = normalizeADPRecords(rawAdpData, (dynasty || superFlex || sleeperADP) ? 'sleeper' : 'fantasypros');

    const adpPlayerIds = new Set(normalizedAdp.map(a => a.sleeper_player_id).filter(Boolean));

    // 5. allPlayerIds: incluir rankings, dst/kicker, adp
    const allPlayerIds = new Set();
    for (const id of adpPlayerIds) allPlayerIds.add(id);
    for (const p of rankings) if (p?.player_id) allPlayerIds.add(toId(p.player_id));
    for (const p of dstRankings) if (p?.player_id) allPlayerIds.add(toId(p.player_id));
    for (const p of kickerRankings) if (p?.player_id) allPlayerIds.add(toId(p.player_id));

    // 6. fetch playersData (solo ids únicos)
    const playersData = await getPlayersData(Array.from(allPlayerIds));

    // 7. proyecciones y picks ya lanzadas antes
    const [projections, drafted] = await Promise.all([projectionsPromise, draftedPromise]);

    const draftedMap = new Map((drafted || []).map(p => [toId(p.player_id), p]));
    const positionMap = new Map((playersData || []).map(p => [toId(p.player_id), p.position]));

    // 8. enrich projections - filtrar solo jugadores válidos
    const enrichedProjections = (projections || []).map(p => {
      const pid = toId(p.player_id);
      const pos = positionMap.get(pid) || null;
      return {
        ...p,
        position: pos,
        status: draftedMap.has(pid) ? 'DRAFTEADO' : 'LIBRE',
        total_projected: Number(p.total_projected || 0), // aseguro número
        player_id: pid // asegurar que player_id sea string
      };
    }).filter(p => p.player_id && typeof p.total_projected === 'number');

    const projectionsWithStdDev = addEstimatedStdDev(enrichedProjections);

    // prevenir error si no hay jugadores válidos
    if (!projectionsWithStdDev.length) {
      return {
        params: { leagueId, position, byeCondition, idExpert, scoring, dynasty, superFlex },
        data: []
      };
    }

    const vorList = calculateVORandDropoffPro(
      projectionsWithStdDev,
      starterPositions,
      numTeams
    );


    // normalizamos vorMap keys a String
    const vorMap = new Map((vorList || []).map(p => [toId(p.player_id), p]));

    // 10. Construcción final (projections para buildFinalPlayers como Map de Strings)
    const projectionMap = new Map((projections || []).map(p => [toId(p.player_id), p.total_projected]));

    const allRankings = [...rankings, ...dstRankings, ...kickerRankings];

    const players = buildFinalPlayers({
      adpData: normalizedAdp,
      playersData,
      rankings: allRankings,
      drafted: drafted || [],
      myDraft: getMainUserDraft(drafted || [], mainUserId),
      num_teams: numTeams,
      byeCondition,
      projectionMap,
      vorMap
    });

    return {
      params: {
        leagueId,
        position,
        byeCondition,
        idExpert,
        scoring,
        dynasty,
        superFlex,
        ranks_published,
        ADPdate: getLatestDateFromADP(normalizedAdp),
        source
      },
      data: players
    };
  } catch (err) {
    // error manejado: devuelve mensaje claro para frontend / logs
    console.error('Error en getDraftData:', err);
    throw new Error(`Error obteniendo datos del draft: ${err.message || err}`);
  }
}
