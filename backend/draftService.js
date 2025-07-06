import { getLeagueData, getConfigValue, getDraftPicks, getADPData, getPlayersData, getRankings, getMainUserDraft } from './lib/draftUtils.js';
import { buildFinalPlayers } from './lib/transformPlayers.js';
import { getStarterPositions } from './utils/helpers.js';

export async function getDraftData(leagueId, { position = 'TODAS', byeCondition = 0, idExpert = 3701 } = {}) {
  const leagueData = await getLeagueData(leagueId);
  const num_teams = leagueData.settings.num_teams;
  const starterPositions = getStarterPositions(leagueData);
  const superFlex = starterPositions.includes('SUPER_FLEX');

  const tipoLiga = await getConfigValue('dynasty');
  const dynasty = leagueData.settings.type === 2 && tipoLiga === 'LIGA';

  const scoring = (
    leagueData.scoring_settings?.rec === 1 ? 'PPR' :
    leagueData.scoring_settings?.rec === 0.5 ? 'HALF' :
    'STANDARD'
  );

  const adpType = getADPtype(scoring, dynasty, superFlex);
  const drafted = await getDraftPicks(leagueData.draft_id);
  const mainUserId = await getConfigValue('main_user_id');
  const myDraft = getMainUserDraft(drafted, mainUserId);
  const adpData = await getADPData(adpType);
  const playerIds = adpData.map(p => p.sleeper_player_id);
  const playersData = await getPlayersData(playerIds);
  const rankings = await getRankings({ dynasty, scoring, idExpert, position });

  const players = buildFinalPlayers({
    adpData,
    playersData,
    rankings,
    drafted,
    myDraft,
    num_teams,
    byeCondition
  });

  return {
    params: { leagueId, position, byeCondition, idExpert, scoring, dynasty, superFlex },
    data: players
  };
}
