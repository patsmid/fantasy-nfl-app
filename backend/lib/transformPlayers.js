import { fuzzySearch } from '../utils/helpers.js';
import { goodOffense } from '../utils/constants.js';
import { assignTiers } from '../utils/tiering.js';

const useHybridTiers = true;

export function buildFinalPlayers({
  adpData,
  playersData,
  rankings,
  drafted,
  myDraft,
  num_teams,
  byeCondition,
  projectionMap = new Map(),
  vorMap = new Map()
}) {
  const draftedMap = new Map(drafted.map(p => [String(p.player_id), p]));
  const playersDataMap = new Map(playersData.map(p => [String(p.player_id), p]));
  const rankingsMap = new Map(rankings.map(r => [String(r.player_id), r]));

  const myByeWeeksSet = new Set();
  const myTeams = [];
  for (const pick of myDraft) {
    const playerId = String(pick.player_id || pick.metadata?.player_id);
    const playerInfo = playersDataMap.get(playerId);
    if (playerInfo) {
      if (!isNaN(playerInfo.bye_week)) myByeWeeksSet.add(Number(playerInfo.bye_week));
      if (playerInfo.team) myTeams.push(playerInfo.team);
    }
  }

  const players = adpData.reduce((acc, adp) => {
    const playerId = String(adp.sleeper_player_id);
    const playerInfo = playersDataMap.get(playerId);
    if (!playerInfo?.full_name) return acc;

    const fullName = playerInfo.full_name;
    const adpValue = adp.adp_value;
    const adpBefore = adp.adp_value_prev || 500;
    const status = draftedMap.has(playerId) ? '' : 'LIBRE';

    let playerRank = rankingsMap.get(playerId);
    if (!playerRank) {
      const fuzzyMatches = fuzzySearch(fullName, rankings);
      playerRank = fuzzyMatches.length ? fuzzyMatches[0] : {};
    }

    const rank = !playerRank.rank
      ? 9999
      : ['DST', 'K'].includes(playerRank.player_eligibility)
        ? playerRank.rank + 1000
        : playerRank.rank;

    const rookie = playerInfo.years_exp === 0 ? ' (R)' : '';
    const bye = Number(playerInfo.bye_week || playerRank.bye_week || 0);
    const byeFound = myByeWeeksSet.has(bye) ? ' 👋' : '';
    const teamFound = myTeams.includes(playerInfo.team) ? ' 🏈' : '';
    const teamGood = goodOffense.includes(playerInfo.team) ? ' ✔️' : '';
    const byeCond = (byeCondition > 0 && bye <= byeCondition) ? ' 🚫' : '';
    const adpRound = Math.ceil(adpValue / num_teams) + 0.01 * (adpValue - num_teams * (Math.ceil(adpValue / num_teams) - 1));

    const projection = projectionMap.get(playerId) || 0;
    const vorData = vorMap.get(playerId) || {};
    const rawVor = vorData.vor || 0;
    const adjustedVor = vorData.adjustedVOR || 0;
    const dropoff = vorData.dropoff || 0;
    const tierBonus = !!vorData.tierBonus;

    const valueTag = getValueTag(adjustedVor, adpValue);
    const riskTags = getRiskTags(playerRank);

    let nombre = `${fullName}${rookie}${teamGood}${byeFound}${teamFound}${byeCond}`;
    if (adjustedVor === 0) nombre += ' 🕳';

    // ===============================
    // CALCULO DE PRIORITY SCORE
    // ===============================
    // Normalizamos valores para combinar en un score
    // Fórmula: priorityScore = (adjustedVOR * 0.6 + projection * 0.3) / ADP
    const normalizedVor = adjustedVor;
    const normalizedProj = projection;
    const normalizedADP = Math.max(1, adpValue);

    const priorityScore = Number(((normalizedVor * 0.6 + normalizedProj * 0.3) / normalizedADP).toFixed(3));

    acc.push({
      player_id: playerId,
      nombre,
      position: playerInfo.position,
      team: playerInfo.team,
      bye,
      rank,
      status,
      adpValue: Number(adpValue.toFixed(2)),
      adpDiff: Number((adpBefore - adpValue).toFixed(2)),
      adpRound: Number(adpRound.toFixed(2)),
      projection: Number(projection.toFixed(2)),
      vor: Number(rawVor.toFixed(2)),
      adjustedVOR: Number(adjustedVor.toFixed(2)),
      dropoff: Number(dropoff.toFixed(2)),
      tierBonus,
      valueTag,
      riskTags,
      hasProjection: adjustedVor > 0,
      priorityScore
    });

    return acc;
  }, []);

  // ===============================
  // ASIGNACIÓN DE TIERS
  // ===============================
  assignTiers(players, false); // tiers globales
  players.forEach(p => {
    p.tier_global = p.tier;
    p.tier_global_label = p.tier_label;
  });

  assignTiers(players, true); // tiers por posición
  players.forEach(p => {
    p.tier_pos = p.tier;
    p.tier_pos_label = p.tier_label;
  });

  // ===============================
  // VALUE OVER ADP
  // ===============================
  players.forEach(p => {
    p.valueOverADP = p.adjustedVOR / Math.max(1, p.adpValue);
    p.stealScore = Number((p.valueOverADP * 100).toFixed(2));
  });

  // ===============================
  // TIER SUMMARY
  // ===============================
  const tierSummaryGlobal = generateTierSummary(players, 'tier_global');
  const tierSummaryPos = generateTierSummary(players, 'tier_pos');

  // ===============================
  // TIER HEATMAP (colores / alertas)
  // ===============================
  const tierHeatmapGlobal = generateTierHeatmap(players, 'tier_global');
  const tierHeatmapPos = generateTierHeatmap(players, 'tier_pos');

  return {
    players: players.sort((a, b) => b.priorityScore - a.priorityScore),
    tierSummaryGlobal,
    tierSummaryPos,
    tierHeatmapGlobal,
    tierHeatmapPos
  };
}

// ==================================
// HELPERS
// ==================================
function getRiskTags(player = {}) {
  const tags = [];
  const boomRate = Number(player.boom_rate ?? player.boom ?? 0);
  const bustRate = Number(player.bust_rate ?? player.bust ?? 0);
  const consistency = Number(player.consistency_score ?? 0);

  if (boomRate > 20) tags.push('🔥 Boom');
  if (bustRate > 20) tags.push('❄️ Bust');
  if (consistency >= 65 && bustRate < 15) tags.push('⚖️ Estable');
  return tags;
}

function getValueTag(vor = 0, adp = 0) {
  if (!vor || !adp) return null;
  const ratio = vor / adp;
  if (ratio > 2.5) return '💎 Steal';
  if (ratio > 1.5) return '📈 Valor';
  if (ratio < 0.5) return '⚠️ Sobrevalorado';
  return null;
}

function generateTierSummary(players, tierField) {
  const summary = {};
  for (const p of players) {
    const tier = p[tierField];
    if (!summary[tier]) {
      summary[tier] = {
        count: 0,
        avgVOR: 0,
        minVOR: Infinity,
        maxVOR: -Infinity,
        avgADP: 0
      };
    }
    const s = summary[tier];
    s.count++;
    s.avgVOR += p.adjustedVOR;
    s.minVOR = Math.min(s.minVOR, p.adjustedVOR);
    s.maxVOR = Math.max(s.maxVOR, p.adjustedVOR);
    s.avgADP += p.adpValue;
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
    const tier = p[tierField];
    if (!heatmap[tier]) heatmap[tier] = [];

    let color = 'neutral';
    if (p.valueOverADP >= 2) color = 'green';
    else if (p.valueOverADP >= 1.2) color = 'lime';
    else if (p.valueOverADP < 0.5) color = 'red';

    heatmap[tier].push({
      player_id: p.player_id,
      nombre: p.nombre,
      position: p.position,
      team: p.team,
      adjustedVOR: p.adjustedVOR,
      adpValue: p.adpValue,
      valueOverADP: Number(p.valueOverADP.toFixed(2)),
      priorityScore: p.priorityScore,
      color
    });
  }
  return heatmap;
}
