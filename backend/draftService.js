import { getConfigValue, getDraftPicks, getADPData, getPlayersData, getRankings, getMainUserDraft } from './lib/draftUtils.js';
import { buildFinalPlayers } from './lib/transformPlayers.js';
import { getSleeperLeague } from './utils/sleeper.js';
import { getStarterPositions, getADPtype } from './utils/helpers.js';
import { getTotalProjections } from './lib/fetchProjections.js';
import { calculateVORandDropoff } from './lib/calculateVORandDropoff.js';

export async function getDraftData(leagueId, { position = 'TODAS', byeCondition = 0, idExpert = 3701 } = {}) {
  // 1. Datos de liga
  const leagueData = await getSleeperLeague(leagueId);
  const num_teams = leagueData.settings.num_teams;
  const starterPositions = getStarterPositions(leagueData);
  const superFlex = starterPositions.includes('SUPER_FLEX');

  // 2. Config y tipo de liga
  const tipoLiga = await getConfigValue('dynasty');
  const dynasty = leagueData.settings.type === 2 && tipoLiga === 'LIGA';

  const scoring = (
    leagueData.scoring_settings?.rec === 1 ? 'PPR' :
    leagueData.scoring_settings?.rec === 0.5 ? 'HALF' :
    'STANDARD'
  );

  // 3. ADP y picks
  const adpType = getADPtype(scoring, dynasty, superFlex);
  const drafted = await getDraftPicks(leagueData.draft_id);
  const mainUserId = await getConfigValue('main_user_id');
  const myDraft = getMainUserDraft(drafted, mainUserId);
  const adpData = await getADPData(adpType);
  const playerIds = adpData.map(p => p.sleeper_player_id);
  const playersData = await getPlayersData(playerIds);

  // 4. Rankings y proyecciones
  const rankings = await getRankings({ dynasty, scoring, idExpert, position });
  const projections = await getTotalProjections(leagueId);
	const projectionMap = new Map(projections.map(p => [p.player_id, p.total_ppr]));

  // 5. VOR y Dropoff
  const vorList = calculateVORandDropoff(projections, starterPositions, num_teams);
  const vorMap = new Map(vorList.map(p => [p.player_id, p]));

  // 6. Construcción de jugadores
	const players = buildFinalPlayers({
	  adpData,
	  playersData,
	  rankings,
	  drafted,
	  myDraft,
	  num_teams,
	  byeCondition,
	  projectionMap
	});

  // 7. Agregar VOR y dropoff a cada jugador
  players.forEach(p => {
    const stats = vorMap.get(p.player_id);
    p.vor = stats?.vor || 0;
    p.dropoff = stats?.dropoff || 0;
  });

  return {
    params: { leagueId, position, byeCondition, idExpert, scoring, dynasty, superFlex },
    data: players
  };
}
