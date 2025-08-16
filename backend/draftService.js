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
    if (expertData?.source === 'fantasypros') {
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

    let rawAdpData = [];
    if (dynasty || superFlex || sleeperADP) {
      rawAdpData = (await getADPData(adpType)) || [];
    } else {
      const adp_type = scoring === 'PPR' ? 'FP_ppr' : scoring === 'HALF' ? 'FP_half-ppr' : 'FP_ppr';
      rawAdpData = (await getFantasyProsADPDataSimple({ adp_type })) || [];
    }

    // Normalización y conversión a número
    const normalizedAdp = normalizeADPRecords(rawAdpData, (dynasty || superFlex || sleeperADP) ? 'sleeper' : 'fantasypros')
      .map(a => ({ ...a, adp_rank: a.adp_rank !== null ? Number(a.adp_rank) : null }));

    const adpPlayerIds = new Set(normalizedAdp.map(a => a.sleeper_player_id).filter(Boolean));
    const adpDate = getLatestDateFromADP(normalizedAdp);

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
    // Sanear proyecciones (asegurar numericidad y injuryRisk decimal 0..1)
    const projectionsWithStdDevMap = (projectionsWithStdDev || []).map(p => {
      const safeTotal = Number.isFinite(Number(p.total_projected)) ? Number(p.total_projected) : 0;
      const safeStd = Number.isFinite(Number(p.projStdDev)) ? Number(p.projStdDev) : 0;
      let safeInjury = Number.isFinite(Number(p.injuryRisk)) ? Number(p.injuryRisk) : 0;
      // addEstimatedStdDev ya devuelve injuryRisk decimal 0..1, pero soportamos % por seguridad:
      if (safeInjury > 1) safeInjury = Math.min(1, safeInjury / 100);
      return {
        ...p,
        total_projected: safeTotal,
        projStdDev: safeStd,
        injuryRisk: safeInjury,
        player_id: String(p.player_id)
      };
    });

    const validProjections = projectionsWithStdDevMap.filter(p => p.position && Number.isFinite(p.total_projected));
    // debug guard
    if (!validProjections.length) {
      console.warn('⚠️ No hay proyecciones válidas para calcular VOR. Revisa addEstimatedStdDev y playersData.');
    }

    // Prepare vorOptions (igual que ya tenías, pero con small hardening)
    const vorOptionsBase = {
      replacementOffset: { RB: 2 },
      replacementWindow: 2,
      dropoffWindow: 2,
      scarcityWeights: { RB: 2.4, WR: 1.3, QB: 1.2, TE: 1.0, K: 1.0, DST: 1.0 },
      playoffWeeks: leagueData.settings?.playoff_weeks || [14,15,16],
      playoffWeightFactor: leagueData.settings?.playoff_weight_factor ?? 0.22,
      minScarcityMultiplier: 0.85,
      maxScarcityMultiplier: 1.5,
      maxRiskPenalty: 0.30,
      riskAlpha: 2.5,
      debug: false
    };

    const vorOptions = { ...vorOptionsBase };

    // superFlex / dynasty adjustments (igual a tu lógica)
    if (superFlex) {
      vorOptions.scarcityWeights = { ...vorOptions.scarcityWeights, QB: (vorOptions.scarcityWeights.QB || 1.2) * 1.35 };
      vorOptions.scarcityWeights.RB = (vorOptions.scarcityWeights.RB || 2.4) * 0.95;
    }
    if (dynasty) {
      vorOptions.injuryFactor = Math.max(0.5, vorOptions.injuryFactor ?? 0.5);
      vorOptions.maxRiskPenalty = Math.min(0.5, (vorOptions.maxRiskPenalty ?? 0.30) + 0.05);
      vorOptions.riskAlpha = (vorOptions.riskAlpha ?? 2.5) * 1.1;
      vorOptions.minScarcityMultiplier = Math.min(0.9, vorOptions.minScarcityMultiplier ?? 0.85);
    }

    // CALL VOR con guard y logging
    let vorList = [];
    try {
      vorList = calculateVORandDropoffPro(validProjections, starterPositions, numTeams, vorOptions) || [];
    } catch (err) {
      console.error('Error en calculateVORandDropoffPro:', err, {
        players: validProjections.length,
        samplePlayer: validProjections[0] || null,
        vorOptions
      });
      // no throw: preferimos devolver resultados parciales si es posible
      vorList = [];
    }

    // MAP PARA USO POSTERIOR
    const vorMap = new Map((vorList || []).map(v => [String(v.player_id), v]));

    // 10. buildFinalPlayers
    //const projectionMap = new Map((projections || []).map(p => [toId(p.player_id), p.total_projected]));
    const projectionMap = new Map((projectionsWithStdDevMap || []).map(p => [String(p.player_id), Number(p.total_projected || 0)]));
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
