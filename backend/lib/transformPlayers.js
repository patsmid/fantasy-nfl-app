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
		const isValidRankingList = Array.isArray(rankings) && rankings.length > 0;
		const ranked = isValidRankingList ? fuzzySearch(name, rankings) : [];
    if (ranked[0]) {
      if (ranked[0]?.bye_week) myByeWeeks.push(ranked[0].bye_week);
      myTeams.push(ranked[0].player_team_id);
    }
  }

  const players = [];
  const positionBuckets = {};

  for (const adp of adpData) {
    const playerId = String(adp.sleeper_player_id);
    const playerInfo = playersData.find(p => p.player_id === playerId);
    if (!playerInfo || !playerInfo.full_name) continue;

    const fullName = playerInfo.full_name;
    const adpValue = adp.adp_value;
    const adpBefore = adp.adp_value_prev || 500;
    const status = draftedMap.has(playerId) ? '' : 'LIBRE';

    let playerRankMatch = [];

    // Si el objeto rankings incluye player_id, úsalo
    if (rankings.some(r => r.player_id === playerInfo.player_id || String(r.player_id) === String(playerInfo.player_id))) {
      playerRankMatch = rankings.filter(r => String(r.player_id) === String(playerInfo.player_id));
    } else {
      playerRankMatch = fuzzySearch(fullName, rankings);
    }

    const playerRank = playerRankMatch[0] || {};
    const rank = !playerRankMatch.length
      ? 9999
      : ['DST', 'K'].includes(playerRank.player_eligibility)
        ? playerRank.rank + 1000
        : playerRank.rank;

    const rookie = playerInfo.years_exp === 0 ? ' (R)' : '';
		const bye = Number(playerInfo.bye_week || playerRank.bye_week || 0);
		const byeFound = myByeWeeks.includes(bye) ? ' 👋' : '';
		// const bye = Number(playerInfo.bye_week || playerRank.bye_week || 0);
		// const byeFound = myByeWeeks.map(Number).includes(bye) ? ' 👋' : '';
    const teamFound = myTeams.includes(playerInfo.team) ? ' 🏈' : '';
    const teamGood = goodOffense.includes(playerInfo.team) ? ' ✔️' : '';
    const byeCond = (byeCondition > 0 && bye <= byeCondition) ? ' 🚫' : '';
    const adpRound = Math.ceil(adpValue / num_teams) + 0.01 * (adpValue - num_teams * (Math.ceil(adpValue / num_teams) - 1));

    const projection = projectionMap.get(playerId) || 0;
    const vorData = vorMap.get(String(playerId)) || {};
    const rawVor = vorData.vor || 0;
    const adjustedVor = vorData.adjustedVOR || 0;
    const dropoff = vorData.dropoff || 0;
    const tierBonus = !!vorData.tierBonus;

		let nombre = `${fullName}${rookie}${teamGood}${byeFound}${teamFound}${byeCond}`;
		if (adjustedVor === 0) nombre += ' 🕳';

    if (!positionBuckets[playerInfo.position]) {
      positionBuckets[playerInfo.position] = [];
    }
		positionBuckets[playerInfo.position].push({ player_id: playerId, adjustedVOR: adjustedVor, dropoff });

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
  		hasProjection: adjustedVor > 0
    });
  }

	// Tiers globales basados en dropoff con mínimo por tier
  const sortedByVOR = [...players].sort((a, b) => b.adjustedVOR - a.adjustedVOR);
  const globalDropoffs = sortedByVOR.map((p, i, arr) =>
    i + 1 < arr.length ? p.adjustedVOR - arr[i + 1].adjustedVOR : 0
  ).filter(d => d > 0);
  const avgGlobalDropoff = globalDropoffs.reduce((a, b) => a + b, 0) / globalDropoffs.length || 1;
  const globalGapThreshold = avgGlobalDropoff * 0.75;
  const MIN_GLOBAL_PER_TIER = 3;

  let currentGlobalTier = 1;
  let globalCountInTier = 0;

  for (let i = 0; i < sortedByVOR.length; i++) {
    const p = sortedByVOR[i];
    const drop = i > 0 ? sortedByVOR[i - 1].adjustedVOR - p.adjustedVOR : 0;
    globalCountInTier++;

    if (i > 0 && drop >= globalGapThreshold && globalCountInTier >= MIN_GLOBAL_PER_TIER) {
      currentGlobalTier++;
      globalCountInTier = 1;
    }

    p.tier_global = currentGlobalTier;
  }
  const maxGlobalTier = Math.max(...players.map(p => p.tier_global || 0));
  for (const p of players) {
    p.tier_global_label = getTierLabel(p.tier_global, maxGlobalTier);
  }

  // Tiers por posición basados en dropoff con mínimo por tier
  const tierByPlayerId = new Map();
  const MIN_POS_PER_TIER = 2;

  for (const [pos, list] of Object.entries(positionBuckets)) {
    const sorted = list.sort((a, b) => b.adjustedVOR - a.adjustedVOR);
    const dropoffs = sorted.map((p, i, arr) =>
      i + 1 < arr.length ? p.adjustedVOR - arr[i + 1].adjustedVOR : 0
    ).filter(d => d > 0);
    const avgDropoff = dropoffs.reduce((a, b) => a + b, 0) / dropoffs.length || 1;
    const gapThreshold = avgDropoff * 0.75;

    let currentTier = 1;
    let countInTier = 0;

    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i];
      const drop = i > 0 ? sorted[i - 1].adjustedVOR - p.adjustedVOR : 0;
      countInTier++;

      if (i > 0 && drop >= gapThreshold && countInTier >= MIN_POS_PER_TIER) {
        currentTier++;
        countInTier = 1;
      }

      tierByPlayerId.set(p.player_id, currentTier);
    }
  }

  // Asignar tier_pos
  for (const p of players) {
    const tierPos = tierByPlayerId.get(p.player_id) || 5;
    p.tier_pos = tierPos;
  }

  // Calcular total de tiers por posición (el máximo encontrado)
  const maxTierPos = Math.max(...players.map(p => p.tier_pos || 0));

  // Asignar etiquetas basadas en total dinámico
  for (const p of players) {
    p.tier_pos_label = getTierLabel(p.tier_pos, maxTierPos);
  }

  return players.sort((a, b) => a.rank - b.rank);
}

function getTierLabel(tier, totalTiers = 5) {
  const labels = [
    '🔥 Elite',
    '💎 Top',
    '⭐ Starter',
    '✅ Confiable',
    '🔄 Relleno',
    '📦 Profundidad',
    '⚠️ Riesgo',
    '🪑 Banca'
  ];

  // Si hay más tiers que etiquetas, repetir las últimas
  const available = labels.slice(0, totalTiers).concat(
    Array(Math.max(0, totalTiers - labels.length)).fill(labels[labels.length - 1])
  );

  const index = Math.min(tier - 1, available.length - 1);
  return available[index];
}
