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
import { getExpertData, getTopExpertsFromDB } from './experts.js';

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

function numberOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function averageNonNull(nums) {
  const arr = nums.filter(n => typeof n === 'number' && Number.isFinite(n));
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// Construye mapa rápido player_id -> rank para cada experto
function buildRankMap(players = []) {
  const m = new Map();
  for (const p of players) {
    const pid = toId(p.player_id);
    // Campos típicos: rank (FantasyPros), overall_rank, ecr, etc.
    const r =
      numberOrNull(p.rank) ??
      numberOrNull(p.overall_rank) ??
      numberOrNull(p.ecr);
    if (pid && r !== null) m.set(String(pid), r);
  }
  return m;
}

export async function getDraftData(
  leagueId,
  { position = 'TODAS', byeCondition = 0, idExpert = null, sleeperADP = false } = {}
) {
  try {
    // 1) Datos base
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

    // ===============================
    // MODO EXPERTO ÚNICO (mantiene tu flujo completo con VOR/tiers)
    // ===============================
    if (idExpert) {
      const expertData = await getExpertData(idExpert);

      // Rankings + Proyecciones + Picks
      const week = 0;
      const rankingsPromise = getRankings({ season, dynasty, scoring, expertData, position: finalPosition, week });
      const projectionsPromise = getAllPlayersProjectedTotals(leagueId);
      const draftedPromise = leagueData.draft_id ? getDraftPicks(leagueData.draft_id) : Promise.resolve([]);

      const rankingsResponse = await rankingsPromise;
      const rankings = Array.isArray(rankingsResponse?.players) ? rankingsResponse.players : [];
      const ranks_published = rankingsResponse?.published ?? null;
      const source = rankingsResponse?.source ?? null;

      // DST & K
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

      // ADP
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

      // allPlayerIds
      const allPlayerIds = new Set([...adpPlayerIds]);
      for (const p of rankings) if (p?.player_id) allPlayerIds.add(String(toId(p.player_id)));
      for (const p of dstRankings) if (p?.player_id) allPlayerIds.add(String(toId(p.player_id)));
      for (const p of kickerRankings) if (p?.player_id) allPlayerIds.add(String(toId(p.player_id)));

      // playersData
      const playersData = await getPlayersData(Array.from(allPlayerIds));

      // proyecciones & picks
      const [projections, drafted] = await Promise.all([projectionsPromise, draftedPromise]);
      const draftedMap = new Map((drafted || []).map(p => [String(toId(p.player_id)), p]));
      const positionMap = new Map((playersData || []).map(p => [String(toId(p.player_id)), p.position]));

      const enrichedProjections = (projections || []).map(p => {
        const pid = String(toId(p.player_id));
        const pos = positionMap.get(pid) || null;
        const total_projected = Number(p.total_projected || 0);
        return {
          ...p,
          position: pos,
          status: draftedMap.has(pid) ? 'DRAFTEADO' : 'LIBRE',
          total_projected,
          player_id: pid
        };
      }).filter(p => p.player_id && typeof p.total_projected === 'number');

      const projectionsWithStdDev = addEstimatedStdDev(enrichedProjections);

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

      const vorOptions = {
        replacementOffset: { RB: 2 },
        replacementWindow: 2,
        dropoffWindow: 2,
        scarcityWeights: { RB: 2.4, WR: 1.3, QB: 1.2, TE: 1.0, K: 1.0, DST: 1.0 },
        playoffWeeks: leagueData.settings?.playoff_weeks || [14, 15, 16],
        playoffWeightFactor: leagueData.settings?.playoff_weight_factor ?? 0.22,
        minScarcityMultiplier: 0.85,
        maxScarcityMultiplier: 1.5,
        maxRiskPenalty: 0.30,
        riskAlpha: 2.5,
        debug: false,
        ...(superFlex ? { scarcityWeights: { RB: 2.4 * 0.95, WR: 1.3, QB: 1.2 * 1.35, TE: 1.0, K: 1.0, DST: 1.0 } } : {}),
        ...(dynasty ? { injuryFactor: 0.5, maxRiskPenalty: 0.35, riskAlpha: 2.75, minScarcityMultiplier: 0.9 } : {})
      };

      let vorList = [];
      try {
        vorList = calculateVORandDropoffPro(validProjections, starterPositions, numTeams, vorOptions) || [];
      } catch (err) {
        console.error('Error en calculateVORandDropoffPro:', err);
        vorList = [];
      }

      const vorMap = new Map((vorList || []).map(v => [String(v.player_id), v]));
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
        mode: 'single_expert',
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
    }

    // ===============================
    // MODO CONSENSO (sin VOR/tiers)
    // ===============================

    // 2) Top 3 expertos
    const top3 = await getTopExpertsFromDB(3);
    if (!top3.length) throw new Error('No hay expertos activos en la tabla "experts".');

    // preparar expertsData (igual que antes)
    const expertsData = top3.map(row => {
      if (!row) return null;
      const src = row.source ? String(row.source).toLowerCase() : 'desconocido';

      if (src === 'fantasypros') {
        return {
          source: 'fantasypros',
          id: row.id, // uuid interno de la tabla experts
          id_experto: row.id_experto ?? null, // partner id numérico (p.ej. 3701)
          experto: row.experto ?? 'Sin nombre'
        };
      }
      if (src === 'manual') {
        return {
          source: 'manual',
          id: row.id,
          experto: row.experto ?? 'Sin nombre'
        };
      }
      if (src === 'flock') {
        return {
          source: 'flock',
          id: row.id,
          experto: row.experto ?? 'Sin nombre'
        };
      }
      return {
        source: src,
        id: row.id,
        id_experto: row.id_experto ?? null,
        experto: row.experto ?? 'Sin nombre'
      };
    }).filter(Boolean);

    // 3) Rankings por experto (obtiene players "crudos" de cada fuente)
    const week = 0;
    const rankingsByExpertRaw = await Promise.all(
      expertsData.map(async (ed) => {
        const r = await getRankings({ season, dynasty, scoring, expertData: ed, position: finalPosition, week });
        return {
          expert_id: ed.id_experto ?? ed.id ?? null,
          expert_name: ed.experto ?? ed.expert ?? 'Desconocido',
          source: r?.source ?? ed.source ?? 'unknown',
          published: r?.published ?? null,
          players: Array.isArray(r?.players) ? r.players : []
        };
      })
    );

    // 4) ADP (igual que antes)
    const adpType = getADPtype(scoring, dynasty, superFlex);
    let rawAdpData2 = [];
    let adpSource = 'fantasypros';
    if (dynasty || superFlex || sleeperADP) {
      rawAdpData2 = (await getADPData(adpType)) || [];
      adpSource = 'sleeper';
    } else {
      const adp_type = scoring === 'PPR' ? 'FP_ppr' : scoring === 'HALF' ? 'FP_half-ppr' : 'FP_ppr';
      rawAdpData2 = (await getFantasyProsADPDataSimple({ adp_type })) || [];
      adpSource = 'fantasypros';
    }
    const normalizedAdp = normalizeADPRecords(rawAdpData2, adpSource).map(a => ({
      ...a,
      adp_rank: a.adp_rank !== null ? Number(a.adp_rank) : null
    }));
    const adpDate = getLatestDateFromADP(normalizedAdp);
    const adpMap = new Map(normalizedAdp.filter(a => a?.sleeper_player_id).map(a => [String(a.sleeper_player_id), a]));

    // 5) Recolectar raw IDs (los que vienen de cada experto)
    //    y separar los que vienen de FantasyPros (necesitan mapping)
    const rawIdsByExpert = []; // array parallelo a rankingsByExpertRaw, con los ids crudos
    const fantasyProsIdsSet = new Set();
    const directIdsSet = new Set(); // ids que ya parecen sleeper/local

    for (const ex of rankingsByExpertRaw) {
      const src = String(ex.source || '').toLowerCase();
      const ids = [];
      for (const p of ex.players || []) {
        if (!p?.player_id) continue;
        const raw = String(toId(p.player_id));
        ids.push(raw);
        if (src === 'fantasypros') fantasyProsIdsSet.add(raw);
        else directIdsSet.add(raw);
      }
      rawIdsByExpert.push(ids);
    }

    // siempre incluir ADP sleeper ids (si los hay) en el conjunto directo
    for (const a of normalizedAdp) {
      if (a?.sleeper_player_id) directIdsSet.add(String(a.sleeper_player_id));
    }

    // 6) Mapear FantasyPros IDs -> sleeper player_id consultando tabla 'players' (supabase)
    //    Se prueban varias columnas candidatas y luego fallback por full_name.
    const fpToSleeper = new Map();
    if (fantasyProsIdsSet.size > 0) {
      const fpArray = Array.from(fantasyProsIdsSet);

      // columnas candidatas en tu tabla players
      const candidateCols = [
        'fantasy_pros_id', 'fp_id', 'fantasypros_id', 'fantasy_pro_id',
        'fantasy_prosid', 'fp_player_id', 'fpId', 'fantasy_id', 'fp_external_id'
      ];

      for (const col of candidateCols) {
        try {
          const { data: rows, error } = await supabase
            .from('players')
            .select(`player_id, ${col}`)
            .in(col, fpArray);

          if (error) continue;
          if (!rows || !rows.length) continue;
          for (const r of rows) {
            const val = r[col];
            if (val != null) {
              fpToSleeper.set(String(val), String(r.player_id));
            }
          }
        } catch (err) {
          // columna inexistente o permiso -> ignorar y seguir con la siguiente
          continue;
        }
      }

      // fallback por nombre para los FP ids que quedaron sin mapear
      const unmapped = Array.from(fpArray).filter(id => !fpToSleeper.has(id));
      if (unmapped.length) {
        // construir map fpId -> name a partir de los rankings fantasypros
        const fpNameMap = new Map();
        for (const ex of rankingsByExpertRaw) {
          if (String(ex.source || '').toLowerCase() !== 'fantasypros') continue;
          for (const p of ex.players || []) {
            const pid = String(toId(p.player_id));
            if (unmapped.includes(pid)) {
              const name = p.name || p.player_name || `${p.first_name || ''} ${p.last_name || ''}`.trim();
              if (name) fpNameMap.set(pid, name);
            }
          }
        }

        const names = Array.from(new Set([...fpNameMap.values()])).filter(Boolean);
        if (names.length) {
          try {
            const { data: nameMatches } = await supabase
              .from('players')
              .select('player_id, full_name')
              .in('full_name', names);

            if (nameMatches && nameMatches.length) {
              for (const [fpId, nm] of fpNameMap.entries()) {
                const match = nameMatches.find(m => String(m.full_name) === String(nm));
                if (match) fpToSleeper.set(fpId, String(match.player_id));
              }
            }
          } catch (err) {
            // fallback busca falló: seguimos adelante
          }
        }
      }
    }

    // 7) Construir el conjunto definitivo de player_ids SLEEPER/local
    const finalIdSet = new Set();
    // agregar los directos (ya sleeper ids) detectados antes
    for (const id of directIdsSet) finalIdSet.add(String(id));
    // agregar mapeos desde fantasypros (solo los que se mapearon)
    for (const [fp, sl] of fpToSleeper.entries()) finalIdSet.add(String(sl));
    // agregar ADP (ya incluidos arriba, pero por seguridad)
    for (const a of normalizedAdp) if (a?.sleeper_player_id) finalIdSet.add(String(a.sleeper_player_id));

    // 8) Obtener playersData solo para los ids unificados
    const playersData = await getPlayersData(Array.from(finalIdSet));
    const playersMap = new Map((playersData || []).map(p => [String(toId(p.player_id)), p]));

    const safeNum = v => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    const averageNonNull = nums => {
      const arr = (nums || []).filter(n => typeof n === 'number' && Number.isFinite(n));
      if (!arr.length) return null;
      return arr.reduce((a, b) => a + b, 0) / arr.length;
    };

    // 9a) Obtener picks del draft y calcular myDraft/myTeams/myByeWeeksSet
    const drafted = leagueData.draft_id ? await getDraftPicks(leagueData.draft_id) : [];
    const draftedMap = new Map((drafted || []).map(p => [String(toId(p.player_id)), p]));

    // getMainUserDraft ya existe en tu archivo (lo usas en modo experto)
    const myDraft = getMainUserDraft(drafted || [], mainUserId) || [];

    const myByeWeeksSet = new Set();
    const myTeams = [];
    for (const pick of (myDraft || [])) {
      const playerId = String(pick?.player_id ?? pick?.metadata?.player_id ?? '');
      const playerInfo = playersMap.get(playerId);
      if (playerInfo) {
        const bw = safeNum(playerInfo?.bye_week ?? 0);
        if (Number.isFinite(bw)) myByeWeeksSet.add(bw);
        if (playerInfo.team) myTeams.push(playerInfo.team);
      }
    }

    // 9b) Asegurarnos goodOffense disponible (si no, usar lista vacía)
    const goodOffenseList = (typeof goodOffense !== 'undefined' && Array.isArray(goodOffense))
      ? goodOffense
      : [];

    // 10) Construcción final de filas (solo desde playersMap => NO duplicados)
    const rows = Array.from(playersMap.keys()).map(pid => {
      const pd = playersMap.get(pid) || {};

      // fallback de nombre/posición desde rankingsByExpertRaw si es necesario
      let fallbackName = pd.full_name || pd.name || null;
      let fallbackPos = pd.position || null;
      if (!fallbackName || !fallbackPos) {
        for (const ex of rankingsByExpertRaw || []) {
          const src = String(ex.source || '').toLowerCase();
          const found = (ex.players || []).find(p => {
            const raw = String(toId(p.player_id));
            const normalized = src === 'fantasypros' ? (fpToSleeper.get(raw) || null) : raw;
            return String(normalized) === String(pid);
          });
          if (found) {
            fallbackName = fallbackName || found.name || found.player_name || `${found.first_name || ''} ${found.last_name || ''}`.trim();
            fallbackPos = fallbackPos || found.position || null;
          }
          if (fallbackName && fallbackPos) break;
        }
      }

      // Info del jugador (como en buildFinalPlayers)
      const playerInfo = pd;
      const isRookie = (playerInfo?.years_exp === 0);
      const rookie = isRookie ? ' (R)' : '';
      const bye = safeNum(playerInfo?.bye_week ?? 0);
      const byeFound = myByeWeeksSet.has(bye) ? ' 👋' : '';
      const teamFound = myTeams.includes(playerInfo?.team) ? ' 🏈' : '';
      const isGoodOffense = goodOffenseList.includes(playerInfo?.team);
      const teamGood = isGoodOffense ? ' ✔️' : '';

      // ranks por experto (usamos rankMaps, que ya normalizaste antes)
      const expert_ranks = rankMaps.map(rm => ({
        expert_id: rm.expert_id,
        expert: rm.expert_name,
        source: rm.source,
        published: rm.published,
        rank: rm.map.get(String(pid)) ?? null
      }));

      const avg_rank = averageNonNull(expert_ranks.map(e => e.rank));
      const adpRec = adpMap.get(String(pid));
      const adp_rank = adpRec?.adp_rank ?? null;

      return {
        player_id: String(pid),
        name: fallbackName || null,
        position: playerInfo?.position || fallbackPos || null,
        team: playerInfo?.team || playerInfo?.team_abbr || null,
        bye,
        // campos solicitados (mismo cálculo que buildFinalPlayers)
        isRookie,
        rookie,
        byeFound,
        teamFound,
        isGoodOffense,
        teamGood,
        // objeto con toda la info cruda del jugador
        player: playerInfo,
        // ADP y rankings
        adp_rank,
        experts: expert_ranks,
        avg_rank
      };
    });

    // 11) Orden final (igual que antes)
    rows.sort((a, b) => {
      if (a.avg_rank === null && b.avg_rank === null) {
        const aAdp = a.adp_rank ?? Infinity;
        const bAdp = b.adp_rank ?? Infinity;
        return aAdp - bAdp;
      }
      if (a.avg_rank === null) return 1;
      if (b.avg_rank === null) return -1;
      if (a.avg_rank !== b.avg_rank) return a.avg_rank - b.avg_rank;
      const aAdp = a.adp_rank ?? Infinity;
      const bAdp = b.adp_rank ?? Infinity;
      return aAdp - bAdp;
    });

    // 12) Resultado (igual formato que antes)
    return {
      mode: 'consensus_simple',
      params: {
        leagueId,
        position,
        byeCondition,
        idExpert: null,
        scoring,
        dynasty,
        superFlex,
        ADPdate: adpDate,
        experts_used: rankingsByExpertRaw.map(ex => ({
          expert_id: ex.expert_id,
          expert: ex.expert_name,
          source: ex.source,
          published: ex.published
        }))
      },
      data: rows
    };
  } catch (err) {
    console.error('Error en getDraftData:', err);
    throw new Error(`Error obteniendo datos del draft: ${err.message || err}`);
  }
}








// === NUEVO: draft manual, sin leagueData ===

// getDraftDataManual.optimizado.js
// "Shark" edition: más rápido, más estable, más útil para novatos.
// Mantiene compatibilidad con tu pipeline actual y agrega mejoras opcionales.
// - Respeta tu buildFinalPlayers / calculateVORandDropoffPro / getRankings / etc.
// - Prefiere ADP desde tu tabla Supabase `sleeper_adp_data` (si existe).
// - Carga perezosa de DST/K y playersData.
// - Proyecciones sintéticas calibradas + desviación estándar estimada.
// - Consejos de draft opcionales (coach) sin romper el contrato de salida.

/*
  Requisitos externos que ya usas en tu backend:
  - getExpertData(idExpert)
  - getRankings({ season, dynasty, scoring, expertData, position })
  - getDSTRankings({ season, dynasty, expertData, weekStatic })
  - getKickerRankings({ season, dynasty, expertData, weekStatic })
  - getADPData(adpType)                              // Sleeper (si no está en DB)
  - getFantasyProsADPDataSimple({ adp_type })        // FantasyPros fallback
  - normalizeADPRecords(rows, provider)              // ya la tienes
  - getPlayersData(playerIdsArray)                   // tu provider/caché
  - getAllPlayersProjectedTotalsGeneric({ season, scoring })  // opcional
  - addEstimatedStdDev(players[])                    // devuelve { projStdDev, injuryRisk }
  - calculateVORandDropoffPro(players, starters, numTeams, options)
  - buildFinalPlayers({...})
  - getMainUserDraft(drafted, mainUserId)

  - supabaseAdmin (si vas a leer ADP de tu tabla `sleeper_adp_data`)
*/

// ===== Helpers locales =====

/**
 * Sobreescribe parámetros con los que salgan de tu tabla `leagues` si envías leagueRow o leagueId.
 * No asume estructura exacta; mapea lo típico de Sleeper/FantasyPros.
 */
async function resolveParamsFromLeague({
  season,
  scoring,
  numTeams,
  starterPositions,
  superFlex,
  dynasty,
  playoffWeeks,
  getLeagueById,  // (leagueId) => leagueRow
  leagueId,
  leagueRow,
}) {
  let row = leagueRow || null;
  if (!row && typeof getLeagueById === 'function' && leagueId) {
    try {
      row = await getLeagueById(leagueId);
    } catch (e) {
      // silencioso: seguimos con parámetros recibidos
    }
  }
  if (!row) return { season, scoring, numTeams, starterPositions, superFlex, dynasty, playoffWeeks };

  const out = { season, scoring, numTeams, starterPositions, superFlex, dynasty, playoffWeeks };

  // Season
  if (!out.season && (row.season || row.year)) out.season = String(row.season || row.year);

  // Scoring
  if (row.scoring_format) {
    const f = String(row.scoring_format).toUpperCase();
    if (['PPR','HALF','HALF_PPR','HALF-PPR','STANDARD'].includes(f)) {
      out.scoring = (f === 'HALF_PPR' || f === 'HALF-PPR') ? 'HALF' : f;
    }
  } else if (row.scoring) {
    out.scoring = String(row.scoring).toUpperCase();
  }

  // Teams
  if (row.num_teams || row.teams || row.total_teams) out.numTeams = Number(row.num_teams || row.teams || row.total_teams);

  // Dynasty / Superflex flags
  const dyn = row.dynasty ?? row.is_dynasty ?? row.mode === 'DYNASTY';
  if (typeof dyn === 'boolean') out.dynasty = dyn;
  const sf = row.superflex ?? row.is_superflex ?? hasSuperflexSlot(row.roster_positions || row.starter_positions);
  if (typeof sf === 'boolean') out.superFlex = sf;

  // Starters
  const starters = normalizeStarterPositions(row.starter_positions || row.roster_positions || out.starterPositions, out.superFlex);
  if (starters && starters.length) out.starterPositions = starters;

  // Playoff weeks (Sleeper default 15-17)
  if (Array.isArray(row.playoff_weeks) && row.playoff_weeks.length) out.playoffWeeks = row.playoff_weeks;

  return out;
}

function hasSuperflexSlot(rosterPositions) {
  if (!Array.isArray(rosterPositions)) return false;
  return rosterPositions.some(p => String(p).toUpperCase().includes('SUPER'));
}

function normalizeStarterPositions(positions, superFlex) {
  if (!Array.isArray(positions) || !positions.length) return inferStarterPositionsByDefault(superFlex);
  const mapFlex = (p) => {
    const up = String(p).toUpperCase();
    if (up.includes('DEF')) return 'DEF';
    if (up === 'D/ST' || up === 'DST' || up === 'D/ST ') return 'DEF';
    if (up === 'PK' || up === 'K' || up === 'KICKER') return 'K';
    if (up.includes('SUPER')) return 'SUPER_FLEX';
    if (up.includes('FLEX')) return 'FLEX';
    if (['QB','RB','WR','TE'].includes(up)) return up;
    // Mapea slots compuestos
    if (up === 'RB/WR/TE') return 'FLEX';
    if (up === 'WR/RB') return 'FLEX';
    if (up === 'WR/TE') return 'FLEX';
    if (up === 'QB/RB/WR/TE') return 'SUPER_FLEX';
    return null; // ignora IDP u otros slots no soportados
  };
  const mapped = positions.map(mapFlex).filter(Boolean);
  const hasK = mapped.includes('K');
  const hasDEF = mapped.includes('DEF') || mapped.includes('DST');
  const base = mapped.filter(x => x !== 'DST');
  // si no trae DEF explícito pero hay DST, normaliza a DEF
  if (!hasDEF && positions.some(p => String(p).toUpperCase() === 'DST')) base.push('DEF');
  // fallback si quedó vacía
  return base.length ? base : inferStarterPositionsByDefault(superFlex);
}

function inferStarterPositionsByDefault(superFlex = false) {
  const base = ['QB','RB','RB','WR','WR','TE','FLEX','K','DEF'];
  return superFlex ? [...base, 'SUPER_FLEX'] : base;
}

/*function getADPtype(scoring = 'PPR', dynasty = false, superFlex = false) {
  if (dynasty && superFlex) return 'DYNASTY_SF';
  if (dynasty) return scoring === 'PPR' ? 'DYNASTY_PPR' : 'DYNASTY_STANDARD';
  if (superFlex) return scoring === 'PPR' ? 'SF_PPR' : 'SF_STANDARD';
  return scoring === 'PPR' ? 'PPR' : scoring === 'HALF' ? 'HALF_PPR' : 'STANDARD';
}*/

// ===== ADP desde Supabase (preferido) con fallback a tus fetchers =====
async function fetchADPPreferred({ adpType, scoring, dynasty, superFlex, sleeperADP, supabaseAdmin }) {
  const useSleeper = dynasty || superFlex || sleeperADP;
  let provider = useSleeper ? 'sleeper' : 'fantasypros';

  // 1) Intentar desde DB si es Sleeper
  if (useSleeper && supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin
        .from('sleeper_adp_data')
        .select('adp_type, sleeper_player_id, adp_value, adp_value_prev, date')
        .eq('adp_type', adpType)
        .order('adp_value', { ascending: true });
      if (error) throw error;
      if (Array.isArray(data) && data.length) {
        const latestDate = data.reduce((m, r) => (r.date && r.date > m ? r.date : m), data[0]?.date || null);
        // normaliza a tu shape utilizado más adelante
        const rows = data.map((r, i) => ({
          sleeper_player_id: String(r.sleeper_player_id),
          adp_rank: i + 1,
          adp_value: Number(r.adp_value),
          adp_value_prev: r.adp_value_prev != null ? Number(r.adp_value_prev) : null,
          date: r.date || latestDate,
        }));
        return { provider: 'sleeper-db', rows, date: latestDate };
      }
    } catch (e) {
      // sigue con fallback
    }
  }

  // 2) Fallback: tus fuentes existentes
  if (useSleeper) {
    const raw = (await getADPData(adpType)) || [];
    const rows = normalizeADPRecords(raw, 'sleeper').map(a => ({ ...a, adp_rank: a.adp_rank != null ? Number(a.adp_rank) : null }));
    return { provider: 'sleeper', rows, date: getLatestDateADP(rows) };
  } else {
    const adp_type = scoring === 'PPR' ? 'FP_ppr' : scoring === 'HALF' ? 'FP_half-ppr' : 'FP_ppr';
    const raw = (await getFantasyProsADPDataSimple({ adp_type })) || [];
    const rows = normalizeADPRecords(raw, 'fantasypros').map(a => ({ ...a, adp_rank: a.adp_rank != null ? Number(a.adp_rank) : null }));
    return { provider: 'fantasypros', rows, date: getLatestDateADP(rows) };
  }
}

function getLatestDateADP(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  return rows.reduce((m, r) => (r.date && r.date > m ? r.date : m), rows[0]?.date || null);
}

// ===== Build consejos (opcional) =====
function buildCoachAdvice({ players, drafted, numTeams, starters }) {
  // Calcula necesidades por posición del usuario principal (si tu frontend lo pasa)
  const need = computeRosterNeedsFromDraft({ drafted, starters });
  // Top targets por posición con mejor combinación VOR+necesidad y valor vs ADP
  const byPos = {};
  for (const p of players) {
    const pos = p.position || p.pos;
    if (!pos) continue;
    if (!byPos[pos]) byPos[pos] = [];
    const valueVsADP = computeValueVsADP(p);
    const score = (p.vor || 0) * (1 + (need[pos] || 0) * 0.25) + valueVsADP * 0.15;
    byPos[pos].push({ id: p.player_id, name: p.name, team: p.team, score, valueVsADP });
  }
  for (const k of Object.keys(byPos)) {
    byPos[k].sort((a,b)=> b.score - a.score);
    byPos[k] = byPos[k].slice(0, 5);
  }
  return { rosterNeeds: need, targetsByPos: byPos, numTeams };
}

function computeRosterNeedsFromDraft({ drafted = [], starters = [] }) {
  // Cuenta slots exigidos por posición básica
  const need = { QB:0,RB:0,WR:0,TE:0,K:0,DEF:0 };
  for (const s of starters) {
    if (need[s] != null) need[s]++;
    else if (s === 'FLEX') {
      // FLEX: distribuye en RB/WR/TE con prioridad a la menor ocupación
      // (heurística simple para guía; tu buildFinalPlayers ya lo maneja en VOR)
      // aquí solo queremos un indicador amigable para UI
      let tgt = 'RB';
      if (need.WR < need[tgt]) tgt = 'WR';
      if (need.TE < need[tgt]) tgt = 'TE';
      need[tgt]++;
    }
  }
  // Resta lo que ya se drafteó (aproximación por posición)
  for (const p of drafted) {
    const pos = p.position || p.pos;
    if (need[pos] != null && need[pos] > 0) need[pos]--;
  }
  return need;
}

function computeValueVsADP(p) {
  // Si tienes rank global (overall) y ADP, calcula delta
  const adpRank = Number(p.adp_rank ?? p.adp_overall ?? Infinity);
  const rank = Number(p.rank ?? p.overall ?? Infinity);
  if (!Number.isFinite(adpRank) || !Number.isFinite(rank)) return 0;
  return Math.max(0, adpRank - rank); // positivo = valor (cae más allá de su ADP)
}

// ====== FUNCIÓN PRINCIPAL ======
export async function getDraftDataManual({
  // Core
  season,
  scoring = 'PPR',
  numTeams = 12,
  starterPositions = null,
  superFlex = false,
  dynasty = false,

  // Filtros/UI
  position = 'TODAS',
  byeCondition = 0,
  idExpert = 3701,
  sleeperADP = false,

  // Draft en vivo
  drafted = [],
  mainUserId = null,
  playoffWeeks = [15,16,17],
  playoffWeightFactor = 0.22,

  // Integración liga/DB
  leagueId = null,
  leagueRow = null,
  getLeagueById = null,
  supabaseAdmin = null,

  // Optimización
  playersDataPreload = null,
  projectionsOverride = null,
  cache = null, // { expertData, rankings, adp, playersData, projections } opcional

  // Otros
  debug = false,
} = {}) {
  try {
    // A) Infiere/normaliza desde `leagues` si está disponible
    const resolved = await resolveParamsFromLeague({
      season, scoring, numTeams, starterPositions, superFlex, dynasty, playoffWeeks,
      getLeagueById, leagueId, leagueRow,
    });
    season = resolved.season; scoring = resolved.scoring; numTeams = resolved.numTeams;
    starterPositions = resolved.starterPositions; superFlex = resolved.superFlex; dynasty = resolved.dynasty;
    playoffWeeks = resolved.playoffWeeks || playoffWeeks;

    // B) Alineaciones titulares
    const starters = Array.isArray(starterPositions) && starterPositions.length
      ? starterPositions.slice()
      : inferStarterPositionsByDefault(superFlex);

    // C) Posición objetivo SUPER_FLEX si aplica
    let finalPosition = position;
    if (superFlex && (position === true || /SUPER[_ ]?FLEX|SUPER/i.test(String(position)))) {
      finalPosition = 'SUPER FLEX';
    }

    // D) Expert + Rankings base (usa caché si se pasó)
    const expertData = cache?.expertData || await getExpertData(idExpert);
    const rankingsResponse = cache?.rankings || await getRankings({ season, dynasty, scoring, expertData, position: finalPosition });
    const rankings = Array.isArray(rankingsResponse?.players) ? rankingsResponse.players : [];
    const ranks_published = rankingsResponse?.published ?? null;
    const source = rankingsResponse?.source ?? null;

    // E) Carga perezosa de DST/K sólo si la liga los usa
    let dstRankings = [];
    let kickerRankings = [];
    const needsDEF = starters.includes('DEF');
    const needsK = starters.includes('K');
    if (expertData?.source === 'fantasypros') {
      if (needsDEF) {
        const dst = await getDSTRankings({ season, dynasty, expertData, weekStatic: null });
        dstRankings = (dst?.players || []).map(p => ({ ...p, rank: (typeof p.rank === 'number' ? p.rank : 9999) + 10000 }));
      }
      if (needsK) {
        const k = await getKickerRankings({ season, dynasty, expertData, weekStatic: null });
        kickerRankings = (k?.players || []).map(p => ({ ...p, rank: (typeof p.rank === 'number' ? p.rank : 9999) + 20000 }));
      }
    }

    // F) ADP preferido
    const adpType = getADPtype(scoring, dynasty, superFlex);
    const adpPkg = cache?.adp || await fetchADPPreferred({ adpType, scoring, dynasty, superFlex, sleeperADP, supabaseAdmin });
    const normalizedAdp = (adpPkg?.rows || []).map(a => ({ ...a, adp_rank: a.adp_rank !== null ? Number(a.adp_rank) : null }));
    const adpPlayerIds = new Set(normalizedAdp.map(a => a.sleeper_player_id).filter(Boolean).map(String));
    const adpDate = adpPkg?.date || null;

    // G) Universo de jugadores
    const allRankings = [...rankings, ...dstRankings, ...kickerRankings];
    const allPlayerIds = new Set([...adpPlayerIds]);
    for (const p of allRankings) if (p?.player_id) allPlayerIds.add(String(p.player_id));

    // H) playersData (sólo faltantes si enviaron preload)
    let playersData = Array.isArray(playersDataPreload) ? playersDataPreload.slice() : null;
    if (!playersData || !playersData.length) {
      playersData = await getPlayersData(Array.from(allPlayerIds));
    } else {
      const have = new Set(playersData.map(p => String(p.player_id)));
      const missing = Array.from(allPlayerIds).filter(id => !have.has(id));
      if (missing.length) {
        const extra = await getPlayersData(missing);
        playersData = [...playersData, ...extra];
      }
    }

    // I) Proyecciones
    let projectionsRaw = Array.isArray(projectionsOverride) && projectionsOverride.length
      ? projectionsOverride
      : (typeof getAllPlayersProjectedTotalsGeneric === 'function' ? (await getAllPlayersProjectedTotalsGeneric({ season, scoring })) || [] : []);
    if (!projectionsRaw.length) {
      projectionsRaw = buildSyntheticProjectionsFromRankings(allRankings, scoring);
    }

    // J) Draft picks + mapas de posición
    const draftedMap = new Map((drafted || []).map(p => [String(p.player_id ?? p.sleeper_player_id ?? p.id), p]));
    const positionMap = new Map((playersData || []).map(p => [String(p.player_id), p.position]));

    // K) Enriquecer proyecciones y filtrar inválidos
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
    }).filter(p => p.player_id && p.position && Number.isFinite(p.total_projected));

    if (!enrichedProjections.length && debug) {
      console.warn('⚠️ No hay jugadores válidos después de enrichProjections (manual).');
    }

    // L) Riesgo/varianza
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

    // M) VOR options con ajustes SF/Dynasty
    const vorOptions = buildVorOptionsManual({ playoffWeeks, playoffWeightFactor, superFlex, dynasty });

    // N) Calcular VOR
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

    // O) Final players
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

    // P) Consejos opcionales de coach (no rompe contratos)
    let coach = null;
    try { coach = buildCoachAdvice({ players, drafted, numTeams, starters }); } catch(_) {}

    return {
      params: {
        season,
        scoring,
        numTeams,
        starterPositions: starters,
        superFlex,
        dynasty,
        position,
        byeCondition,
        idExpert,
        ranks_published,
        ADPdate: adpDate,
        ADPprovider: adpPkg?.provider || null,
        source
      },
      data: players,
      coach // <- opcional, tu UI lo puede ignorar
    };
  } catch (err) {
    console.error('Error en getDraftDataManualOptimizado:', err);
    throw new Error(`Error en draft (optimizado): ${err.message || err}`);
  }
}

// ====== Opciones VOR base + ajustes ======
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

// ====== Proyecciones sintéticas (fallback) ======
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

    // ajuste por scoring
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
