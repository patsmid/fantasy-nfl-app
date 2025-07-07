import { fuzzySearch } from '../utils/helpers.js';
import { goodOffense } from '../utils/constants.js';

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
  const myByeWeeks = [];
  const myTeams = [];

  for (const pick of myDraft) {
    const name = `${pick.metadata.first_name} ${pick.metadata.last_name}`;
    const ranked = fuzzySearch(name, rankings.players);
    if (ranked[0]) {
      myByeWeeks.push(ranked[0].bye_week);
      myTeams.push(ranked[0].player_team_id);
    }
  }

  const players = [];
  const positionBuckets = {};
  let maxGlobalVor = 0;

  for (const adp of adpData) {
    const playerId = String(adp.sleeper_player_id);
    const playerInfo = playersData.find(p => p.player_id === playerId);
    if (!playerInfo || !playerInfo.full_name) continue;

    const fullName = playerInfo.full_name;
    const adpValue = adp.adp_value;
    const adpBefore = adp.adp_value_prev || 500;
    const status = draftedMap.has(playerId) ? '' : 'LIBRE';

    const playerRankMatch = fuzzySearch(fullName, rankings.players);
    const playerRank = playerRankMatch[0] || {};
    const rank = !playerRankMatch.length
      ? 9999
      : ['DST', 'K'].includes(playerRank.player_eligibility)
        ? playerRank.rank + 1000
        : playerRank.rank;

    const rookie = playerInfo.years_exp === 0 ? ' (R)' : '';
    const bye = playerRank.bye_week || 0;
    const byeFound = myByeWeeks.includes(bye) ? ' 👋' : '';
    const teamFound = myTeams.includes(playerInfo.team) ? ' 🏈' : '';
    const teamGood = goodOffense.includes(playerInfo.team) ? ' ✔️' : '';
    const byeCond = (byeCondition > 0 && bye <= byeCondition) ? ' 🚫' : '';
    const adpRound = Math.ceil(adpValue / num_teams) + 0.01 * (adpValue - num_teams * (Math.ceil(adpValue / num_teams) - 1));

    const projection = projectionMap.get(playerId) || 0;
    const rawVor = vorMap.get(String(playerId))?.vor || 0;
    const adjustedVor = vorMap.get(String(playerId))?.adjustedVOR || 0;
    const dropoff = vorMap.get(playerId)?.dropoff || 0;

    // Bucket por posición
    if (!positionBuckets[playerInfo.position]) {
      positionBuckets[playerInfo.position] = [];
    }
    positionBuckets[playerInfo.position].push({ player_id: playerId, vor: rawVor });

    if (rawVor > maxGlobalVor) maxGlobalVor = rawVor;

    players.push({
      player_id: playerId,
      nombre: `${fullName}${rookie}${teamGood}${byeFound}${teamFound}${byeCond}`,
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
      dropoff: Number(dropoff.toFixed(2))
    });
  }

  // Tiers dinámicos globales
  for (const p of players) {
    const vor = p.vor;
    let tier = 5;
    if (vor >= 0.8 * maxGlobalVor) tier = 1;
    else if (vor >= 0.6 * maxGlobalVor) tier = 2;
    else if (vor >= 0.4 * maxGlobalVor) tier = 3;
    else if (vor >= 0.2 * maxGlobalVor) tier = 4;
    p.tier_global = tier;
    p.tier_global_label = getTierLabel(tier);
  }

  // Tiers dinámicos por posición
  const tierByPlayerId = new Map();

  for (const [pos, list] of Object.entries(positionBuckets)) {
    const sorted = list.sort((a, b) => b.vor - a.vor);
    const maxPosVor = sorted[0]?.vor || 0;

    for (const { player_id, vor } of sorted) {
      let tier = 5;
      if (vor >= 0.8 * maxPosVor) tier = 1;
      else if (vor >= 0.6 * maxPosVor) tier = 2;
      else if (vor >= 0.4 * maxPosVor) tier = 3;
      else if (vor >= 0.2 * maxPosVor) tier = 4;
      tierByPlayerId.set(player_id, tier);
    }
  }

  // Asignar tier_pos
  for (const p of players) {
    const tierPos = tierByPlayerId.get(p.player_id) || 5;
    p.tier_pos = tierPos;
    p.tier_pos_label = getTierLabel(tierPos);
  }

  return players.sort((a, b) => a.rank - b.rank);
}

function getTierLabel(tier) {
  switch (tier) {
    case 1: return '🔥 Elite';
    case 2: return '⭐ Starter';
    case 3: return '✅ Confiable';
    case 4: return '🔄 Relleno';
    default: return '⚠️ Riesgo';
  }
}
