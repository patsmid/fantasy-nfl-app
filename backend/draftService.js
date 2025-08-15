// draftService.fixed.js (con logging de diagnóstico)
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

function normalizeADPRecords(adpArray = [], source = 'unknown') {
  if (!Array.isArray(adpArray)) return [];
  return adpArray.map(r => {
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
  const dates = normalizedAdp.map(a => (a.date ? new Date(a.date) : null)).filter(Boolean);
  if (dates.length === 0) return null;
  const latest = new Date(Math.max(...dates.map(d => d.getTime())));
  return latest.toISOString().split('T')[0];
}

export async function getDraftData(
  leagueId,
  { position = 'TODAS', byeCondition = 0, idExpert = 3701, sleeperADP = false } = {}
) {
  try {
    // 1. Datos base
    const [leagueData, season, mainUserId, tipoLiga] = await Promise.all([
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

    let finalPosition = position;
    if (superFlex && (position === true || position === 'SUPER' || position === 'SUPER_FLEX' || position === 'SUPER FLEX')) {
      finalPosition = 'SUPER FLEX';
    }

    // 2. Rankings + proyecciones
    const expertData = await getExpertData(idExpert);
    const rankingsPromise = getRankings({ season, dynasty, scoring, expertData, position: finalPosition });
    const projectionsPromise = getAllPlayersProjectedTotals(leagueId);
    const draftedPromise = leagueData.draft_id ? getDraftPicks(leagueData.draft_id) : Promise.resolve([]);

    const rankingsResponse = await rankingsPromise;
    const rankings = Array.isArray(rankingsResponse?.players) ? rankingsResponse.players : [];
    const ranks_published = rankingsResponse?.published ?? null;
    const source = rankingsResponse?.source ?? null;

    // 3. DST & Kicker
    let dstRankings = [];
    let kickerRankings = [];
    if (expertData?.source !== 'flock') {
      if (starterPositions.includes('DEF')) {
        dstRankings = (await getDSTRankings({ season, dynasty, expertData, weekStatic: null }))?.players?.map(p => ({
          ...p,
          rank: (typeof p.rank === 'number' ? p.rank : 9999) + 10000
        })) || [];
      }
      if (starterPositions.includes('K')) {
        kickerRankings = (await getKickerRankings({ season, dynasty, expertData, weekStatic: null }))?.players?.map(p => ({
          ...p,
          rank: (typeof p.rank === 'number' ? p.rank : 9999) + 20000
        })) || [];
      }
    }

    // 4. ADP
    const adpType = getADPtype(scoring, dynasty, superFlex);
    console.log('📊 ADP Flow:', { scoring, dynasty, superFlex, sleeperADP, adpType });

    let rawAdpData = [];
    if (dynasty || superFlex || sleeperADP) {
      rawAdpData = (await getADPData(adpType)) || [];
      console.log('📌 getADPData returned:', rawAdpData.length, 'records');
    } else {
      const adp_type = scoring === 'PPR' ? 'FP_ppr' : scoring === 'HALF' ? 'FP_half-ppr' : 'FP_ppr';
      rawAdpData = (await getFantasyProsADPDataSimple({ adp_type })) || [];
      console.log('📌 getFantasyProsADPDataSimple returned:', rawAdpData.length, 'records');
    }

    // Normalización y conversión a número
    const normalizedAdp = normalizeADPRecords(rawAdpData, (dynasty || superFlex || sleeperADP) ? 'sleeper' : 'fantasypros')
      .map(a => ({ ...a, adp_rank: a.adp_rank !== null ? Number(a.adp_rank) : null }));

    console.log('🔹 normalizedAdp sample:', normalizedAdp.slice(0, 5));

    const adpPlayerIds = new Set(normalizedAdp.map(a => a.sleeper_player_id).filter(Boolean));
    console.log('🆔 ADP Player IDs count:', adpPlayerIds.size);

    const adpDate = getLatestDateFromADP(normalizedAdp);
    console.log('📅 Latest ADP date:', adpDate);

    // 5. allPlayerIds
    const allPlayerIds = new Set([...adpPlayerIds]);
    for (const p of rankings) if (p?.player_id) allPlayerIds.add(toId(p.player_id));
    for (const p of dstRankings) if (p?.player_id) allPlayerIds.add(toId(p.player_id));
    for (const p of kickerRankings) if (p?.player_id) allPlayerIds.add(toId(p.player_id));

    // 6. fetch playersData
    const playersData = await getPlayersData(Array.from(allPlayerIds));

    // 7. proyecciones y picks
    const [projections, drafted] = await Promise.all([projectionsPromise, draftedPromise]);
    const draftedMap = new Map((drafted || []).map(p => [toId(p.player_id), p]));
    const positionMap = new Map((playersData || []).map(p => [toId(p.player_id), p.position]));

    // 8. enrich projections + logging diagnóstico
    const enrichedProjections = (projections || []).map(p => {
      const pid = toId(p.player_id);
      const pos = positionMap.get(pid) || null;
      const total_projected = Number(p.total_projected || 0);

      if (isNaN(total_projected)) {
        console.warn(`⚠️ total_projected inválido para player_id=${pid} name=${p.full_name || p.name}`);
      }

      return {
        ...p,
        position: pos,
        status: draftedMap.has(pid) ? 'DRAFTEADO' : 'LIBRE',
        total_projected,
        player_id: pid
      };
    }).filter(p => p.player_id && typeof p.total_projected === 'number');

    if (!enrichedProjections.length) {
      console.warn('⚠️ No hay jugadores válidos después de enrichProjections');
      return { params: { leagueId, position, byeCondition, idExpert, scoring, dynasty, superFlex }, data: [] };
    }

    const projectionsWithStdDev = addEstimatedStdDev(enrichedProjections);

    // 9. VOR
    const validProjections = projectionsWithStdDev.filter(p => p.position);
    if (!validProjections.length) {
      console.warn('⚠️ No hay jugadores con posición válida para VOR');
    }
    const vorList = calculateVORandDropoffPro(validProjections, starterPositions, numTeams) || [];
    const vorMap = new Map(vorList.map(p => [toId(p.player_id), p]));

    // 10. buildFinalPlayers
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
        ADPdate: adpDate,
        source
      },
      data: players
    };
  } catch (err) {
    console.error('Error en getDraftData:', err);
    throw new Error(`Error obteniendo datos del draft: ${err.message || err}`);
  }
}
