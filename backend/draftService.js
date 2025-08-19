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
    const projectionsWithStdDevMap = (projectionsWithStdDev || []).map(p => {
      const safeTotal = Number.isFinite(Number(p.total_projected)) ? Number(p.total_projected) : 0;
      const safeStd = Number.isFinite(Number(p.projStdDev)) ? Number(p.projStdDev) : 0;
      let safeInjury = Number.isFinite(Number(p.injuryRisk)) ? Number(p.injuryRisk) : 0;
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

    let vorList = [];
    try {
      vorList = calculateVORandDropoffPro(validProjections, starterPositions, numTeams, vorOptions) || [];
    } catch (err) {
      console.error('Error en calculateVORandDropoffPro:', err, {
        players: validProjections.length,
        samplePlayer: validProjections[0] || null,
        vorOptions
      });
      vorList = [];
    }

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

// === NUEVO: draft manual, sin leagueData ===
// Reusa tus imports existentes arriba (no repitas normalizeADPRecords ni getLatestDateFromADP).
// Añade, si quieres, un provider genérico de proyecciones en tu projectionsService:
//   export async function getAllPlayersProjectedTotalsGeneric({ season, scoring }) { ... }
// Si no lo tienes, el código cae al generador de proyecciones sintéticas.
export async function getDraftDataManual({
  // Core “manual”
  season,                          // <- RECOMENDADO (string/number). Si no, intenta inferir en tus configs.
  scoring = 'PPR',                 // 'PPR' | 'HALF' | 'STANDARD'
  numTeams = 12,
  starterPositions = null,         // array ej. ['QB','RB','RB','WR','WR','TE','FLEX','K','DEF'] o null para default
  superFlex = false,
  dynasty = false,

  // Filtros/UI
  position = 'TODAS',
  byeCondition = 0,
  idExpert = 3701,
  sleeperADP = false,              // fuerza usar ADP de Sleeper aunque no sea SF/Dynasty

  // Draft en vivo (manual)
  drafted = [],                    // picks ya hechos [{player_id, ...}]
  mainUserId = null,               // para getMainUserDraft
  playoffWeeks = [15,16,17],       // ajusta a tu calendario
  playoffWeightFactor = 0.22,

  // Optimización
  playersDataPreload = null,       // si tienes cache de playersData, pásala
  projectionsOverride = null,      // si tienes proyecciones propias, pásalas
  debug = false
} = {}) {
  try {
    // 0) Normaliza alineaciones titulares (si no te pasan, inferimos)
    const starters = Array.isArray(starterPositions) && starterPositions.length
      ? starterPositions.slice()
      : inferStarterPositionsByDefault(superFlex);

    // Si el usuario pide SUPER / SUPER_FLEX como posición objetivo:
    let finalPosition = position;
    if (superFlex && (position === true || position === 'SUPER' || position === 'SUPER_FLEX' || position === 'SUPER FLEX')) {
      finalPosition = 'SUPER FLEX';
    }

    // 1) Rankings + DST/K (idéntico a tu pipeline)
    const expertData = await getExpertData(idExpert);
    const rankingsResponse = await getRankings({ season, dynasty, scoring, expertData, position: finalPosition });
    const rankings = Array.isArray(rankingsResponse?.players) ? rankingsResponse.players : [];
    const ranks_published = rankingsResponse?.published ?? null;
    const source = rankingsResponse?.source ?? null;

    let dstRankings = [];
    let kickerRankings = [];
    if (expertData?.source === 'fantasypros') {
      if (starters.includes('DEF')) {
        const dst = await getDSTRankings({ season, dynasty, expertData, weekStatic: null });
        dstRankings = (dst?.players || []).map(p => ({ ...p, rank: (typeof p.rank === 'number' ? p.rank : 9999) + 10000 }));
      }
      if (starters.includes('K')) {
        const k = await getKickerRankings({ season, dynasty, expertData, weekStatic: null });
        kickerRankings = (k?.players || []).map(p => ({ ...p, rank: (typeof p.rank === 'number' ? p.rank : 9999) + 20000 }));
      }
    }

    // 2) ADP (Sleeper/FantasyPros, sin liga)
    const adpType = getADPtype(scoring, dynasty, superFlex);
    let rawAdpData = [];
    if (dynasty || superFlex || sleeperADP) {
      rawAdpData = (await getADPData(adpType)) || [];
    } else {
      const adp_type = scoring === 'PPR' ? 'FP_ppr' : scoring === 'HALF' ? 'FP_half-ppr' : 'FP_ppr';
      rawAdpData = (await getFantasyProsADPDataSimple({ adp_type })) || [];
    }
    const normalizedAdp = normalizeADPRecords(rawAdpData, (dynasty || superFlex || sleeperADP) ? 'sleeper' : 'fantasypros')
      .map(a => ({ ...a, adp_rank: a.adp_rank !== null ? Number(a.adp_rank) : null }));
    const adpPlayerIds = new Set(normalizedAdp.map(a => a.sleeper_player_id).filter(Boolean));
    const adpDate = getLatestDateFromADP(normalizedAdp);

    // 3) Player universe = ADP ∪ Rankings ∪ DST ∪ K
    const allRankings = [...rankings, ...dstRankings, ...kickerRankings];
    const allPlayerIds = new Set([...adpPlayerIds]);
    for (const p of allRankings) if (p?.player_id) allPlayerIds.add(String(p.player_id));

    // 4) playersData
    const playersData = Array.isArray(playersDataPreload) && playersDataPreload.length
      ? playersDataPreload
      : await getPlayersData(Array.from(allPlayerIds));

    // 5) Proyecciones
    //    - prioridad: projectionsOverride
    //    - luego: provider genérico (si lo tienes)
    //    - si no, generamos proyecciones sintéticas a partir de rankings (curvas por posición)
    let projectionsRaw = [];
    if (Array.isArray(projectionsOverride) && projectionsOverride.length) {
      projectionsRaw = projectionsOverride;
    } else if (typeof getAllPlayersProjectedTotalsGeneric === 'function') {
      projectionsRaw = (await getAllPlayersProjectedTotalsGeneric({ season, scoring })) || [];
    } else {
      projectionsRaw = buildSyntheticProjectionsFromRankings(allRankings, scoring);
    }

    // 6) Draft picks manual
    const draftedMap = new Map((drafted || []).map(p => [String(p.player_id ?? p.sleeper_player_id ?? p.id), p]));
    const positionMap = new Map((playersData || []).map(p => [String(p.player_id), p.position]));

    // 7) Enriquecer proyecciones
    const enrichedProjections = (projectionsRaw || []).map(p => {
      const pid = String(p.player_id);
      const pos = positionMap.get(pid) || p.position || null;
      const total_projected = Number(p.total_projected || p.points || 0);
      return {
        ...p,
        position: pos,
        status: draftedMap.has(pid) ? 'DRAFTEADO' : 'LIBRE',
        total_projected,
        player_id: pid
      };
    }).filter(p => p.player_id && Number.isFinite(p.total_projected));

    if (!enrichedProjections.length && debug) {
      console.warn('⚠️ No hay jugadores válidos después de enrichProjections (manual).');
    }

    // 8) Riesgo/varianza
    const projectionsWithStdDev = addEstimatedStdDev(enrichedProjections).map(p => {
      let injury = Number.isFinite(Number(p.injuryRisk)) ? Number(p.injuryRisk) : 0;
      if (injury > 1) injury = Math.min(1, injury / 100);
      return {
        ...p,
        total_projected: Number(p.total_projected) || 0,
        projStdDev: Number(p.projStdDev) || 0,
        injuryRisk: injury,
        player_id: String(p.player_id)
      };
    });

    const validProjections = projectionsWithStdDev.filter(p => p.position && Number.isFinite(p.total_projected));

    // 9) Opciones VOR (GTO defaults + ajustes SF/Dynasty)
    const vorOptions = buildVorOptionsManual({
      playoffWeeks,
      playoffWeightFactor,
      superFlex,
      dynasty
    });

    // 10) Calcular VOR
    let vorList = [];
    try {
      vorList = calculateVORandDropoffPro(validProjections, starters, numTeams, vorOptions) || [];
    } catch (err) {
      if (debug) {
        console.error('Error en calculateVORandDropoffPro (manual):', err, {
          players: validProjections.length,
          samplePlayer: validProjections[0] || null,
          vorOptions
        });
      }
      vorList = [];
    }
    const vorMap = new Map((vorList || []).map(v => [String(v.player_id), v]));
    const projectionMap = new Map((projectionsWithStdDev || []).map(p => [String(p.player_id), Number(p.total_projected || 0)]));

    // 11) buildFinalPlayers (igual que en tu servicio)
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
        // identidad “manual”
        season,
        scoring,
        numTeams,
        starterPositions: starters,
        superFlex,
        dynasty,
        // filtros/metadata
        position,
        byeCondition,
        idExpert,
        ranks_published,
        ADPdate: adpDate,
        source
      },
      data: players
    };
  } catch (err) {
    console.error('Error en getDraftDataManual:', err);
    throw new Error(`Error en draft manual: ${err.message || err}`);
  }
}

// === Helpers manuales pasar a otro archiv===

// Alineaciones titulares por defecto (estándar high-stakes managed)
function inferStarterPositionsByDefault(superFlex = false) {
  const base = ['QB','RB','RB','WR','WR','TE','FLEX','K','DEF'];
  return superFlex ? [...base, 'SUPER_FLEX'] : base;
}

function buildVorOptionsManual({
  playoffWeeks = [15,16,17],
  playoffWeightFactor = 0.22,
  superFlex = false,
  dynasty = false
}) {
  const base = {
    replacementOffset: { RB: 2 },
    replacementWindow: 2,
    dropoffWindow: 2,
    scarcityWeights: { RB: 2.4, WR: 1.3, QB: 1.2, TE: 1.0, K: 1.0, DST: 1.0 },
    playoffWeeks,
    playoffWeightFactor,
    minScarcityMultiplier: 0.85,
    maxScarcityMultiplier: 1.5,
    maxRiskPenalty: 0.30,
    riskAlpha: 2.5,
    debug: false
  };

  if (superFlex) {
    base.scarcityWeights.QB = (base.scarcityWeights.QB || 1.2) * 1.35;
    base.scarcityWeights.RB = (base.scarcityWeights.RB || 2.4) * 0.95;
  }
  if (dynasty) {
    base.injuryFactor = Math.max(0.5, base.injuryFactor ?? 0.5);
    base.maxRiskPenalty = Math.min(0.5, (base.maxRiskPenalty ?? 0.30) + 0.05);
    base.riskAlpha = (base.riskAlpha ?? 2.5) * 1.1;
    base.minScarcityMultiplier = Math.min(0.9, base.minScarcityMultiplier ?? 0.85);
  }
  return base;
}

// Proyecciones sintéticas por posición si no hay provider disponible.
// Mantiene ordenamiento y da magnitudes razonables para VOR.
// Si prefieres, calibra con medias históricas propias.
function buildSyntheticProjectionsFromRankings(rankings = [], scoring = 'PPR') {
  const posRank = new Map(); // position -> running rank
  const out = [];

  const curves = {
    QB: r => Math.max(160, 380 - 3.3*(r-1) - 0.020*(r-1)*(r-1)),
    RB: r => Math.max( 90, 315 - 4.0*(r-1) - 0.050*(r-1)*(r-1)),
    WR: r => Math.max(100, 310 - 3.0*(r-1) - 0.035*(r-1)*(r-1)),
    TE: r => Math.max( 70, 250 - 4.5*(r-1) - 0.120*(r-1)*(r-1)),
    K : r => Math.max( 90, 160 - 1.2*(r-1)),
    DST:r => Math.max( 80, 140 - 1.0*(r-1))
  };

  for (const p of rankings) {
    const pid = String(p.player_id);
    const pos = p.position || p.pos || null;
    if (!pid || !pos) continue;

    const r = (posRank.get(pos) || 0) + 1;
    posRank.set(pos, r);

    const curve = curves[pos] || ((x)=>Math.max(60, 200 - 2.0*(x-1)));
    const basePts = curve(r);

    // pequeño ajuste por scoring (WR/TE se mueven más en PPR/HALF)
    let adj = basePts;
    if (scoring === 'HALF' && (pos === 'WR' || pos === 'TE' || pos === 'RB')) adj *= 0.93;
    if (scoring === 'STANDARD' && (pos === 'WR' || pos === 'TE' || pos === 'RB')) adj *= 0.86;

    out.push({
      player_id: pid,
      position: pos,
      total_projected: Number(adj.toFixed(2))
    });
  }
  return out;
}
