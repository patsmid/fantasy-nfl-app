import {
  getConfigValue,
  getDraftPicks,
  getADPData,
  getPlayersData,
  getRankings,
  getMainUserDraft
} from './lib/draftUtils.js';

import { getSleeperLeague } from './utils/sleeper.js';
import { getAllPlayersProjectedTotals } from './lib/projectionsService.js';
import { calculateVORandDropoff } from './lib/vorUtils.js';
import { buildFinalPlayers } from './lib/transformPlayers.js';
import { getStarterPositions, getADPtype } from './utils/helpers.js';

export async function getDraftData(
  leagueId,
  { position = 'TODAS', byeCondition = 0, idExpert = 3701 } = {}
) {
  // 1. Datos de la liga desde Sleeper
  const leagueData = await getSleeperLeague(leagueId);
  const numTeams = leagueData.settings.num_teams;
  const starterPositions = getStarterPositions(leagueData);
  const superFlex = starterPositions.includes('SUPER_FLEX');

  // 2. Configuración de tipo de liga
  const tipoLiga = await getConfigValue('dynasty');
  const dynasty = leagueData.settings.type === 2 && tipoLiga === 'LIGA';

  const scoring =
    leagueData.scoring_settings?.rec === 1
      ? 'PPR'
      : leagueData.scoring_settings?.rec === 0.5
      ? 'HALF'
      : 'STANDARD';

  // 3. Picks del draft y usuario principal
  const adpType = getADPtype(scoring, dynasty, superFlex);
  const drafted = await getDraftPicks(leagueData.draft_id);
  const mainUserId = await getConfigValue('main_user_id');
	const season = await getConfigValue('season');
  const myDraft = getMainUserDraft(drafted, mainUserId);

  // 4. Jugadores y ADP
  const adpData = await getADPData(adpType);
  const playerIds = adpData.map((p) => p.sleeper_player_id);
  const playersData = await getPlayersData(playerIds);

  // 5. Rankings del experto
  const rankings = await getRankings({
		season,
    dynasty,
    scoring,
    idExpert,
    position
  });

  // 6. Proyecciones totales (calculadas desde stats y scoring)
  const projections = await getAllPlayersProjectedTotals(leagueId);

  // 7. Cálculo de VOR y Dropoff (solo jugadores LIBRES)
  const draftedMap = new Map(drafted.map((p) => [String(p.player_id), p]));

  // Crear un mapa rápido de posiciones por player_id
  const positionMap = new Map(playersData.map(p => [String(p.player_id), p.position]));

  // Enriquecer proyecciones con posición
  const projectionsWithPosition = projections.map(p => ({
    ...p,
    position: positionMap.get(String(p.player_id)) || null,
    status: draftedMap.has(p.player_id) ? 'DRAFTEADO' : 'LIBRE'
  }));

  const vorList = calculateVORandDropoff(
    projectionsWithPosition,
    starterPositions,
    numTeams
  );
  const vorMap = new Map(vorList.map((p) => [p.player_id, p]));

  // 8. Construcción final del arreglo de jugadores
  const players = buildFinalPlayers({
    adpData,
    playersData,
    rankings,
    drafted,
    myDraft,
    num_teams: numTeams,
    byeCondition,
    projectionMap: new Map(
      projections.map((p) => [p.player_id, p.total_projected])
    ),
    vorMap
  });

  // Resultado final
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
