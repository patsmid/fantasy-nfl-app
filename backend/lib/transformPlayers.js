import { fuzzySearch } from '../utils/helpers.js';

const goodOffense = ['KC', 'HOU', 'SF', 'CIN', 'PHI', 'MIA', 'BAL', 'DET', 'BUF', 'GB', 'LAR', 'ATL', 'JAX', 'CHI'];

export function buildFinalPlayers({ adpData, playersData, rankings, drafted, myDraft, num_teams, byeCondition }) {
  const draftedMap = new Map(drafted.map(p => [String(p.player_id), p]));
  const myByeWeeks = [];
  const myteams = [];

  myDraft.forEach(item => {
    const ranked = fuzzySearch(`${item.metadata.first_name} ${item.metadata.last_name}`, rankings.players);
    if (ranked[0]) {
      myByeWeeks.push(ranked[0].bye_week);
      myteams.push(ranked[0].player_team_id);
    }
  });

  const players = [];

  for (const adp of adpData) {
    const playerId = String(adp.sleeper_player_id);
    const playerInfo = playersData.find(p => p.player_id === playerId);
    if (!playerInfo) continue;

    const fullName = playerInfo.full_name;
    const adpValue = adp.adp_value;
    const adpBefore = adp.adp_value_prev || 500;
    const draftedStatus = draftedMap.has(playerId) ? '' : 'LIBRE';
    const playerRank = fuzzySearch(fullName, rankings.players);
    const rank = (!playerRank.length)
      ? 9999
      : ['DST', 'K'].includes(playerRank[0].player_eligibility)
        ? playerRank[0].rank + 1000
        : playerRank[0].rank;

    const rookie = playerInfo.years_exp === 0 ? ' (R)' : '';
    const bye = playerRank[0]?.bye_week || 0;
    const byeFound = myByeWeeks.includes(bye) ? ' 👋' : '';
    const teamFound = myteams.includes(playerInfo.team) ? ' 🏈' : '';
    const teamGood = goodOffense.includes(playerInfo.team) ? ' ✔️' : '';
    const adpRound = Math.ceil(adpValue / num_teams) + 0.01 * (adpValue - num_teams * (Math.ceil(adpValue / num_teams) - 1));
    const byeCond = (byeCondition > 0 && bye <= byeCondition) ? ' 🚫' : '';

    players.push({
      adpValue,
      nombre: `${fullName}${rookie}${teamGood}${byeFound}${teamFound}${byeCond}`,
      position: playerInfo.position,
      team: playerInfo.team,
      bye,
      rank,
      status: draftedStatus,
      adpRound: adpRound.toFixed(2),
      adpDiff: adpBefore - adpValue
    });
  }

  return players.sort((a, b) => a.rank - b.rank);
}
