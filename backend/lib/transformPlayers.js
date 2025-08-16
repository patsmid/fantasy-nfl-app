// transformPlayers.fixed.js
import { fuzzySearch } from '../utils/helpers.js';
import { goodOffense } from '../utils/constants.js';
import { assignTiers } from '../utils/tiering.js';

const useHybridTiers = true;

// Helpers locales
const safeNum = v => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const toFixedSafe = (v, d = 2) => {
  const n = safeNum(v);
  return Number(n.toFixed(d));
};
const pickAdpValue = adp => {
  // distintas formas que puede venir ADP, priorizamos adp_rank numérico
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
  return 500; // legacy fallback
};

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
  // maps rápidos
  const draftedMap = new Map((drafted || []).map(p => [String(p.player_id), p]));
  const playersDataMap = new Map((playersData || []).map(p => [String(p.player_id), p]));
  const rankingsMap = new Map((rankings || []).map(r => [String(r.player_id), r]));

  // quick myDraft derived info
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

  // Construcción robusta de jugadores
  const players = (adpData || []).reduce((acc, adp) => {
    try {
      // player id (si no tiene id, ignoramos)
      const rawId = adp?.sleeper_player_id ?? adp?.player_id ?? adp?.id;
      if (rawId == null) return acc;
      const playerId = String(rawId);

      const playerInfo = playersDataMap.get(playerId);
      if (!playerInfo || !playerInfo.full_name) return acc;

      const fullName = playerInfo.full_name;
      const adpValue = pickAdpValue(adp);
      const adpBefore = pickPreviousAdp(adp);
      const status = draftedMap.has(playerId) ? '' : 'LIBRE';

      // Ranking (si no está, fuzzy search)
      let playerRank = rankingsMap.get(playerId);
      if (!playerRank) {
        const fuzzyMatches = fuzzySearch(fullName, rankings || []);
        playerRank = fuzzyMatches.length ? fuzzyMatches[0] : {};
      }

      const rankRaw = safeNum(playerRank?.rank ?? 9999);
      const rank = ['DST', 'K'].includes(playerRank?.player_eligibility) ? rankRaw + 1000 : rankRaw;

      const rookie = (playerInfo?.years_exp === 0) ? ' (R)' : '';
      const bye = safeNum(playerInfo?.bye_week ?? playerRank?.bye_week ?? 0);
      const byeFound = myByeWeeksSet.has(bye) ? ' 👋' : '';
      const teamFound = myTeams.includes(playerInfo?.team) ? ' 🏈' : '';
      const teamGood = goodOffense.includes(playerInfo?.team) ? ' ✔️' : '';
      const byeCond = (byeCondition > 0 && bye <= byeCondition) ? ' 🚫' : '';

      // ADP round (si adpValue <= 0 devolvemos 0 para evitar ruido)
      const safeAdp = Math.max(0, safeNum(adpValue));
      let adpRound = 0;
      if (safeAdp > 0) {
        const rnd = Math.ceil(safeAdp / Math.max(1, num_teams));
        adpRound = rnd + 0.01 * (safeAdp - num_teams * (rnd - 1));
      } else {
        // legacy behaviour: small positive sentinel so the UI doesn't show NaN
        adpRound = 0;
      }

      // Proyección y VOR (usar números seguros)
      const projection = safeNum(projectionMap.get(playerId) ?? 0);
      const vorDataRaw = vorMap.get(String(playerId)) ?? {};

      const rawVor = safeNum(vorDataRaw?.vor ?? 0);
      const adjustedVor = safeNum(vorDataRaw?.adjustedVOR ?? vorDataRaw?.riskAdjustedVOR ?? vorDataRaw?.injuryAdjustedVOR ?? 0);
      const dropoff = safeNum(vorDataRaw?.dropoff ?? 0);
      const tierBonus = !!vorDataRaw?.tierBonus;

      // si existe playoffAdjustedVOR o riskAdjustedVOR preferimos para scoring
      const finalVOR = safeNum(vorDataRaw?.playoffAdjustedVOR ?? vorDataRaw?.riskAdjustedVOR ?? adjustedVor ?? rawVor);

      // Tags y nombre
      const valueTag = getValueTag(adjustedVor, safeAdp);
      const riskTags = getRiskTags(playerRank);

      let nombre = `${fullName}${rookie}${teamGood}${byeFound}${teamFound}${byeCond}`;
      if (adjustedVor === 0) nombre += ' 🕳';

      // Priority Score: mantengo la fórmula, pero uso finalVOR si está disponible
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
        hasProjection: normalizedVor > 0 || projection > 0,
        priorityScore
      });
    } catch (err) {
      // no rompemos: logueamos y seguimos
      console.warn('Error procesando player en buildFinalPlayers:', adp, err?.message ?? err);
    }
    return acc;
  }, []);

  // ===============================
  // ASIGNACIÓN DE TIERS (igual que antes)
  // ===============================
  // Global tiers
  assignTiers(players, false);
  players.forEach(p => {
    p.tier_global = p.tier;
    p.tier_global_label = p.tier_label;
  });

  // Posicional tiers (sobreescribe p.tier / p.tier_label pero guardamos posicional)
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

// ==================================
// HELPERS (copiados/ajustados)...
function getRiskTags(player = {}) {
  const tags = [];
  const boomRate = safeNum(player.boom_rate ?? player.boom ?? 0);
  const bustRate = safeNum(player.bust_rate ?? player.bust ?? 0);
  const consistency = safeNum(player.consistency_score ?? 0);

  if (boomRate > 20) tags.push('🔥 Boom');
  if (bustRate > 20) tags.push('❄️ Bust');
  if (consistency >= 65 && bustRate < 15) tags.push('⚖️ Estable');
  return tags;
}

function getValueTag(vor = 0, adp = 0) {
  const v = safeNum(vor);
  const a = safeNum(adp);
  if (!v || !a) return null;
  const ratio = v / a;
  if (ratio > 2.5) return '💎 Steal';
  if (ratio > 1.5) return '📈 Valor';
  if (ratio < 0.5) return '⚠️ Sobrevalorado';
  return null;
}

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
      valueOverADP: Number(safeNum(valueOverADP).toFixed(2)),
      priorityScore: Number(safeNum(p.priorityScore).toFixed(3)),
      color
    });
  }
  return heatmap;
}
