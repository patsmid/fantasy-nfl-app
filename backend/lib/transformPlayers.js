// transformPlayers.fixed.v5.js
import { fuzzySearch } from '../utils/helpers.js';
import { goodOffense } from '../utils/constants.js';
import { assignTiers } from '../utils/tiering.js';

const useHybridTiers = true; // (reservado)

// ===============================
// Helpers locales
// ===============================
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

const safeNum = v => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const toFixedSafe = (v, d = 2) => {
  const n = safeNum(v);
  return Number(n.toFixed(d));
};

const pickAdpValue = adp => {
  const candidates = [adp?.adp_rank, adp?.adp_value, adp?.adp, adp?.adpValue, adp?.rank];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n)) return n;
  }
  return 0;
};

const pickPreviousAdp = adp => {
  const candidates = [adp?.adp_value_prev, adp?.prev_adp, adp?.adp_prev];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n)) return n;
  }
  return 500;
};

// ===============================
// Boom / Bust / Consistency (rápido)
// ===============================
function computeBoomBustConsistencyFast(player = {}) {
  const proj = safeNum(player.projection ?? player.projected ?? 0);
  const floor = safeNum(player.floor ?? proj * 0.8);
  const ceil = safeNum(player.ceil ?? proj * 1.2);

  let boomRate = 0;
  let bustRate = 0;
  let consistency = 50;

  if (proj > 0) {
    // relativizamos por proyección
    boomRate = clamp(Math.round(((ceil - proj) / Math.max(1, proj)) * 100), 0, 100);
    bustRate = clamp(Math.round(((proj - floor) / Math.max(1, proj)) * 100), 0, 100);
    // consistencia alta cuando boom ~ bust y ambos bajos
    const spread = Math.abs(boomRate - bustRate);
    const vol = (boomRate + bustRate) / 2;
    consistency = clamp(Math.round(100 - (spread * 0.7 + vol * 0.3)), 0, 100);
  }

  return { boomRate, bustRate, consistency };
}

// ===============================
// Estimador de floor/ceil GTO (sin datos semanales)
// ===============================
// Objetivo: entregar un piso/techo razonables usando la información disponible
// (posición, VOR, dropoff, ADP diff, rookie, calidad ofensiva, tier) sin romper la lógica.
function estimateFloorCeil({
  position = 'UNK',
  projection = 0,
  adjustedVor = 0,
  dropoff = 0,
  adpDiff = 0,
  isRookie = false,
  isGoodOffense = false,
  tier = 4
}) {
  const proj = Math.max(0, safeNum(projection));

  // 1) Volatilidad base por posición (rango típico semana a semana)
  const baseVolMap = {
    QB: 0.18,
    RB: 0.30,
    WR: 0.28,
    TE: 0.24,
    DST: 0.40,
    K: 0.35,
    UNK: 0.28
  };
  const baseVol = baseVolMap[position] ?? baseVolMap.UNK;

  // 2) Factores contextuales
  const tierAdj = tier <= 2 ? -0.06 : tier === 3 ? -0.02 : tier >= 6 ? 0.05 : 0.02; // tiers altos = menor varianza
  const vorAdj = clamp(adjustedVor / 100, -0.05, 0.05); // VOR alto sugiere menor volatilidad relativa
  const dropAdj = clamp(dropoff / 50, 0, 0.12); // grandes caídas adelante -> más varianza
  const adpAdj = clamp(Math.abs(adpDiff) / 40, 0, 0.1); // ADP moviéndose = más varianza
  const rookieAdj = isRookie ? 0.06 : 0;
  const offenseAdj = isGoodOffense ? -0.03 : 0;

  let vol = baseVol + tierAdj - vorAdj + dropAdj + adpAdj + rookieAdj + offenseAdj;
  vol = clamp(vol, 0.12, 0.5); // mantén razonable

  // 3) Asimetría: techo crece más que cae el piso (upside premium tipo GTO)
  const upMult = 1.4; // sube 40% de la volatilidad
  const downMult = 1.0; // baja 100% de la volatilidad

  const floor = proj * (1 - vol * downMult);
  const ceil = proj * (1 + vol * upMult);

  return {
    floor: Math.max(0, floor),
    ceil: Math.max(proj, ceil),
    volatility: vol
  };
}

// ===============================
// Risk Tags
// ===============================
function getRiskTags(player = {}) {
  // aceptar múltiples nombres de campos
  let boomRate = safeNum(player.boom_rate ?? player.boomRate ?? player.boom ?? 0);
  let bustRate = safeNum(player.bust_rate ?? player.bustRate ?? player.bust ?? 0);
  let consistency = safeNum(player.consistency_score ?? player.consistency ?? 0);

  if (!boomRate && !bustRate && !consistency) {
    const computed = computeBoomBustConsistencyFast(player);
    boomRate = computed.boomRate;
    bustRate = computed.bustRate;
    consistency = computed.consistency;
  }

  const tags = [];
  if (boomRate >= 25) tags.push('🔥 Boom');
  if (bustRate >= 20) tags.push('❄️ Bust');
  if (consistency >= 65 && bustRate < 15) tags.push('⚖️ Estable');
  return tags;
}

// ===============================
// Value Tag
// ===============================
function getValueTag(vorParam = 0, adpParam = 0) {
  const vor = safeNum(vorParam);
  const adp = safeNum(adpParam);
  if (!vor || !adp) return null;
  const ratio = vor / adp;
  if (ratio > 2.5) return '💎 Steal';
  if (ratio > 1.5) return '📈 Valor';
  if (ratio < 0.5) return '⚠️ Sobrevalorado';
  return null;
}

// ===============================
// Tier Summary & Heatmap
// ===============================
function generateTierSummary(players, tierField) {
  const summary = {};
  for (const p of players) {
    const tier = p[tierField] ?? 0;
    if (!summary[tier]) {
      summary[tier] = { count: 0, avgVOR: 0, minVOR: Infinity, maxVOR: -Infinity, avgADP: 0 };
    }
    const s = summary[tier];
    s.count++;
    s.avgVOR += safeNum(p.adjustedVOR);
    s.minVOR = Math.min(s.minVOR, safeNum(p.adjustedVOR));
    s.maxVOR = Math.max(s.maxVOR, safeNum(p.adjustedVOR));
    s.avgADP += safeNum(p.adpValue);
  }

  for (const tier of Object.keys(summary)) {
    const s = summary[tier];
    s.avgVOR = Number((s.avgVOR / s.count).toFixed(2));
    s.avgADP = Number((s.avgADP / s.count).toFixed(2));
  }
  return summary;
}

function generateTierHeatmap(players, tierField) {
  const heatmap = {};
  for (const p of players) {
    const tier = p[tierField] ?? 0;
    if (!heatmap[tier]) heatmap[tier] = [];

    let color = 'neutral';
    const valueOverADP = safeNum(p.valueOverADP);
    if (valueOverADP >= 2) color = 'green';
    else if (valueOverADP >= 1.2) color = 'lime';
    else if (valueOverADP < 0.5) color = 'red';

    heatmap[tier].push({
      player_id: p.player_id,
      nombre: p.nombre,
      position: p.position,
      team: p.team,
      adjustedVOR: safeNum(p.adjustedVOR),
      adpValue: safeNum(p.adpValue),
      valueOverADP: Number(valueOverADP.toFixed(2)),
      priorityScore: Number(safeNum(p.priorityScore).toFixed(3)),
      color
    });
  }
  return heatmap;
}

// ===============================
// Build Final Players
// ===============================
export function buildFinalPlayers({
  adpData = [],
  playersData = [],
  rankings = [],
  drafted = [],
  myDraft = [],
  num_teams = 10,
  byeCondition = 0,
  projectionMap = new Map(),
  vorMap = new Map()
}) {
  const draftedMap = new Map((drafted || []).map(p => [String(p.player_id), p]));
  const playersDataMap = new Map((playersData || []).map(p => [String(p.player_id), p]));
  const rankingsMap = new Map((rankings || []).map(r => [String(r.player_id), r]));

  const myByeWeeksSet = new Set();
  const myTeams = [];
  for (const pick of (myDraft || [])) {
    const playerId = String(pick?.player_id ?? pick?.metadata?.player_id ?? '');
    const playerInfo = playersDataMap.get(playerId);
    if (playerInfo) {
      const bw = Number(playerInfo.bye_week);
      if (Number.isFinite(bw)) myByeWeeksSet.add(bw);
      if (playerInfo.team) myTeams.push(playerInfo.team);
    }
  }

  const players = (adpData || []).reduce((acc, adp) => {
    try {
      const rawId = adp?.sleeper_player_id ?? adp?.player_id ?? adp?.id;
      if (rawId == null) return acc;
      const playerId = String(rawId);

      const playerInfo = playersDataMap.get(playerId);
      if (!playerInfo || !playerInfo.full_name) return acc;

      const fullName = playerInfo.full_name;
      const adpValue = pickAdpValue(adp);
      const adpBefore = pickPreviousAdp(adp);
      const status = draftedMap.has(playerId) ? '' : 'LIBRE';

      let playerRank = rankingsMap.get(playerId);
      if (!playerRank) {
        const fuzzyMatches = fuzzySearch(fullName, rankings || []);
        playerRank = fuzzyMatches.length ? fuzzyMatches[0] : {};
      }

      const rankRaw = safeNum(playerRank?.rank ?? 9999);
      const rank = ['DST', 'K'].includes(playerRank?.player_eligibility) ? rankRaw + 1000 : rankRaw;

      const isRookie = (playerInfo?.years_exp === 0);
      const rookie = isRookie ? ' (R)' : '';
      const bye = safeNum(playerInfo?.bye_week ?? playerRank?.bye_week ?? 0);
      const byeFound = myByeWeeksSet.has(bye) ? ' 👋' : '';
      const teamFound = myTeams.includes(playerInfo?.team) ? ' 🏈' : '';
      const isGoodOffense = goodOffense.includes(playerInfo?.team);
      const teamGood = isGoodOffense ? ' ✔️' : '';
      const byeCond = (byeCondition > 0 && bye <= byeCondition) ? ' 🚫' : '';

      const safeAdp = Math.max(0, safeNum(adpValue));
      let adpRound = 0;
      if (safeAdp > 0) {
        const rnd = Math.ceil(safeAdp / Math.max(1, num_teams));
        adpRound = rnd + 0.01 * (safeAdp - num_teams * (rnd - 1));
      }

      const projection = safeNum(projectionMap.get(playerId) ?? 0);
      const vorDataRaw = vorMap.get(String(playerId)) ?? {};

      const rawVor = safeNum(vorDataRaw?.vor ?? 0);
      const adjustedVor = safeNum(vorDataRaw?.adjustedVOR ?? vorDataRaw?.riskAdjustedVOR ?? vorDataRaw?.injuryAdjustedVOR ?? 0);
      const dropoff = safeNum(vorDataRaw?.dropoff ?? 0);
      const tierBonus = !!vorDataRaw?.tierBonus;
      const finalVOR = safeNum(vorDataRaw?.playoffAdjustedVOR ?? vorDataRaw?.riskAdjustedVOR ?? adjustedVor ?? rawVor);

      const valueTag = getValueTag(adjustedVor, safeAdp);

      // ===============================
      // NUEVO: estimar floor/ceil y boombust/consistency de forma determinista
      // ===============================
      // Primero necesitamos un tier preliminar para el estimador (usa rank como proxy si aún no hay tier)
      // Asignaremos tiers reales más abajo, pero para el estimador usamos una aproximación
      const prelimTier = rank <= 48 ? 2 : rank <= 96 ? 3 : rank <= 160 ? 4 : 5;

      const { floor, ceil, volatility } = estimateFloorCeil({
        position: playerInfo?.position ?? 'UNK',
        projection,
        adjustedVor,
        dropoff,
        adpDiff: safeNum(adpBefore - safeAdp),
        isRookie,
        isGoodOffense,
        tier: prelimTier
      });

      const { boomRate, bustRate, consistency } = computeBoomBustConsistencyFast({
        projection,
        floor,
        ceil
      });

      const riskTags = getRiskTags({
        boomRate,
        bustRate,
        consistency,
        projection,
        adjustedVOR: adjustedVor,
        adpValue: safeAdp,
        dropoff
      });

      let nombre = `${fullName}${rookie}${teamGood}${byeFound}${teamFound}${byeCond}`;
      if (adjustedVor === 0) nombre += ' 🕳';

      const normalizedVor = finalVOR;
      const normalizedProj = projection;
      const normalizedADP = Math.max(1, safeAdp);
      const priorityScore = Number(((normalizedVor * 0.6 + normalizedProj * 0.3) / normalizedADP).toFixed(3));

      acc.push({
        player_id: playerId,
        nombre,
        position: playerInfo?.position ?? 'UNK',
        team: playerInfo?.team ?? 'UNK',
        bye,
        rank,
        status,
        adpValue: toFixedSafe(safeAdp, 2),
        adpDiff: toFixedSafe(adpBefore - safeAdp, 2),
        adpRound: toFixedSafe(adpRound, 2),
        projection: toFixedSafe(projection, 2),
        vor: toFixedSafe(rawVor, 2),
        adjustedVOR: toFixedSafe(adjustedVor, 2),
        dropoff: toFixedSafe(dropoff, 2),
        tierBonus,
        valueTag,
        riskTags,
        // NUEVO: exponer métricas para front/depuración
        floor: toFixedSafe(floor, 2),
        ceil: toFixedSafe(ceil, 2),
        volatility: toFixedSafe(volatility, 3),
        boomRate: toFixedSafe(boomRate, 0),
        bustRate: toFixedSafe(bustRate, 0),
        consistency: toFixedSafe(consistency, 0),
        hasProjection: normalizedVor > 0 || projection > 0,
        priorityScore
      });
    } catch (err) {
      console.warn('Error procesando player en buildFinalPlayers:', adp, err?.message ?? err);
    }
    return acc;
  }, []);

  // ===============================
  // ASIGNACIÓN DE TIERS (global y posicional)
  // ===============================
  assignTiers(players, false);
  players.forEach(p => {
    p.tier_global = p.tier;
    p.tier_global_label = p.tier_label;
  });

  assignTiers(players, true);
  players.forEach(p => {
    p.tier_pos = p.tier;
    p.tier_pos_label = p.tier_label;
  });

  // ===============================
  // VALUE OVER ADP
  // ===============================
  players.forEach(p => {
    p.valueOverADP = Number((safeNum(p.adjustedVOR) / Math.max(1, safeNum(p.adpValue))).toFixed(2));
    p.stealScore = Number((safeNum(p.valueOverADP) * 100).toFixed(2));
  });

  // ===============================
  // TIER SUMMARY & HEATMAP
  // ===============================
  const tierSummaryGlobal = generateTierSummary(players, 'tier_global');
  const tierSummaryPos = generateTierSummary(players, 'tier_pos');
  const tierHeatmapGlobal = generateTierHeatmap(players, 'tier_global');
  const tierHeatmapPos = generateTierHeatmap(players, 'tier_pos');

  return {
    players: players.sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0)),
    tierSummaryGlobal,
    tierSummaryPos,
    tierHeatmapGlobal,
    tierHeatmapPos
  };
}
