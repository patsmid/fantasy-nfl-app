import { fuzzySearch } from '../utils/helpers.js';
import { goodOffense } from '../utils/constants.js';
import { assignTiersHybrid } from '../utils/tiering.js';

const useHybridTiers = true; // true = híbrido adjustedVOR + dropoff

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

  // ===============================
  // MIS BYE WEEKS Y EQUIPOS
  // ===============================
  const myByeWeeks = [];
  const myTeams = [];

  for (const pick of myDraft) {
    const playerId = String(pick.player_id || pick.metadata?.player_id);
    const playerInfo = playersData.find(p => String(p.player_id) === playerId);
    if (playerInfo) {
      if (!isNaN(playerInfo.bye_week)) myByeWeeks.push(Number(playerInfo.bye_week));
      if (playerInfo.team) myTeams.push(playerInfo.team);
    }
  }
  const myByeWeeksSet = new Set(myByeWeeks);

  const players = [];

  // ===============================
  // CREACIÓN DEL DATASET
  // ===============================
  for (const adp of adpData) {
    const playerId = String(adp.sleeper_player_id);
    const playerInfo = playersData.find(p => p.player_id === playerId);
    if (!playerInfo?.full_name) continue;

    const fullName = playerInfo.full_name;
    const adpValue = adp.adp_value;
    const adpBefore = adp.adp_value_prev || 500;
    const status = draftedMap.has(playerId) ? '' : 'LIBRE';

    // Ranking: exacto o fuzzy
    let playerRankMatch = rankings.some(r => String(r.player_id) === playerId)
      ? rankings.filter(r => String(r.player_id) === playerId)
      : fuzzySearch(fullName, rankings);

    const playerRank = playerRankMatch[0] || {};
    const rank = !playerRankMatch.length
      ? 9999
      : ['DST', 'K'].includes(playerRank.player_eligibility)
        ? playerRank.rank + 1000
        : playerRank.rank;

    // Tags y datos derivados
    const rookie = playerInfo.years_exp === 0 ? ' (R)' : '';
    const bye = Number(playerInfo.bye_week || playerRank.bye_week || 0);
    const byeFound = myByeWeeksSet.has(bye) ? ' 👋' : '';
    const teamFound = myTeams.includes(playerInfo.team) ? ' 🏈' : '';
    const teamGood = goodOffense.includes(playerInfo.team) ? ' ✔️' : '';
    const byeCond = (byeCondition > 0 && bye <= byeCondition) ? ' 🚫' : '';
    const adpRound = Math.ceil(adpValue / num_teams) + 0.01 * (adpValue - num_teams * (Math.ceil(adpValue / num_teams) - 1));

    // Stats de proyección / VOR
    const projection = projectionMap.get(playerId) || 0;
    const vorData = vorMap.get(playerId) || {};
    const rawVor = vorData.vor || 0;
    const adjustedVor = vorData.adjustedVOR || 0;
    const dropoff = vorData.dropoff || 0;
    const tierBonus = !!vorData.tierBonus;

    const valueTag = getValueTag(adjustedVor, Number(adpValue.toFixed(2)));
    const riskTags = getRiskTags(playerRank);

    let nombre = `${fullName}${rookie}${teamGood}${byeFound}${teamFound}${byeCond}`;
    if (adjustedVor === 0) nombre += ' 🕳';

    players.push({
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
      hasProjection: adjustedVor > 0
    });
  }

  // ===============================
  // ASIGNACIÓN DE TIERS
  // ===============================

  // Tier global híbrido
  const playersGlobal = [...players];
  assignTiersHybrid(playersGlobal, false);
  const maxGlobalTier = Math.max(...playersGlobal.map(p => p.tier || 1));
  for (const p of players) {
    const pg = playersGlobal.find(pl => pl.player_id === p.player_id);
    p.tier_global = pg?.tier || maxGlobalTier;
    p.tier_global_label = getTierLabel(p.tier_global, maxGlobalTier, 'global');
  }

  // Tier por posición
  const playersPos = [...players];
  assignTiersHybrid(playersPos, true);
  const maxTierPos = Math.max(...playersPos.map(p => p.tier || 1));
  for (const p of players) {
    const pp = playersPos.find(pl => pl.player_id === p.player_id);
    p.tier_pos = pp?.tier || maxTierPos;
    p.tier_pos_label = getTierLabel(p.tier_pos, maxTierPos, 'pos');
  }

  // Orden final por ranking
  return players.sort((a, b) => a.rank - b.rank);
}

// ==================================
// HELPERS
// ==================================
function getTierLabel(tier, totalTiers = 5, type = 'global') {
  const labelsGlobal = [
    '🔥 Elite',
    '💎 Top',
    '⭐ Starter',
    '✅ Confiable',
    '🔄 Relleno',
    '📦 Profundidad',
    '⚠️ Riesgo',
    '🪑 Bench'
  ];

  const labelsPos = [
    '🏆 Elite Pos',
    '💎 Top Pos',
    '⭐ Starter Pos',
    '✅ Confiable Pos',
    '🔄 Relleno Pos',
    '📦 Profundidad Pos',
    '⚠️ Riesgo Pos',
    '🪑 Bench Pos'
  ];

  const labels = type === 'global' ? labelsGlobal : labelsPos;
  const available = labels.slice(0, totalTiers).concat(
    Array(Math.max(0, totalTiers - labels.length)).fill(labels[labels.length - 1])
  );

  return available[Math.min(tier - 1, available.length - 1)];
}

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
