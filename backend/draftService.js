import { getConfigValue, getDraftPicks, getADPData, getPlayersData, getRankings, getMainUserDraft } from './lib/draftUtils.js';
import { getSleeperLeague } from './utils/sleeper.js';
import { getTotalProjections, getTotalProjectionsFromSleeper, getTotalProjectionsFromDb } from './lib/projectionsService.js';
import { calculateVORandDropoff } from './lib/vorUtils.js';
import { buildFinalPlayers } from './lib/transformPlayers.js';
import { getStarterPositions, getADPtype } from './utils/helpers.js';

export async function getDraftData(leagueId, { position = 'TODAS', byeCondition = 0, idExpert = 3701 } = {}) {
  // 1. Datos de liga
  const leagueData = await getSleeperLeague(leagueId);
  const num_teams = leagueData.settings.num_teams;
  const starterPositions = getStarterPositions(leagueData);
  const superFlex = starterPositions.includes('SUPER_FLEX');

  // 2. Configuración de liga
  const tipoLiga = await getConfigValue('dynasty');
  const dynasty = leagueData.settings.type === 2 && tipoLiga === 'LIGA';

  const scoring = (
    leagueData.scoring_settings?.rec === 1 ? 'PPR' :
    leagueData.scoring_settings?.rec === 0.5 ? 'HALF' :
    'STANDARD'
  );

  // 3. Obtener datos del draft y mis picks
  const adpType = getADPtype(scoring, dynasty, superFlex);
  const drafted = await getDraftPicks(leagueData.draft_id);
  const mainUserId = await getConfigValue('main_user_id');
  const myDraft = getMainUserDraft(drafted, mainUserId);

  // 4. ADP y jugadores
  const adpData = await getADPData(adpType);
  const playerIds = adpData.map(p => p.sleeper_player_id);
  const playersData = await getPlayersData(playerIds);

  // 5. Rankings
  const rankings = await getRankings({ dynasty, scoring, idExpert, position });

  // 6. Proyecciones totales por jugador (PPR ajustado según configuración de liga)
  const projections = await getTotalProjectionsFromDb(leagueId);

  // 7. VOR y Dropoff (solo jugadores LIBRE, usando scarcity)
  const draftedMap = new Map(drafted.map(p => [String(p.player_id), p]));
  const projectionsWithStatus = projections.map(p => ({
    ...p,
    status: draftedMap.has(p.player_id) ? 'DRAFTEADO' : 'LIBRE'
  }));

  const vorList = calculateVORandDropoff(projectionsWithStatus, starterPositions, num_teams);
	const vorMap = new Map(vorList.map(p => [p.player_id, p]));

  // 8. Construcción final de jugadores
  const players = buildFinalPlayers({
    adpData,
    playersData,
    rankings,
    drafted,
    myDraft,
    num_teams,
    byeCondition,
    projectionMap: new Map(projections.map(p => [p.player_id, p.total_ppr])),
    vorMap
  });

  return {
    params: {
      leagueId,
      position,
      byeCondition,
      idExpert,
      scoring,
      dynasty,
      superFlex
    },
    data: players
  };
}
