import {
  getConfigValue,
  getDraftPicks,
  getADPData,
  getPlayersData,
  getMainUserDraft
} from './lib/draftUtils.js';
import { getRankings, getDSTRankings, getKickerRankings } from './lib/rankingsService.js';
import { getSleeperLeague } from './utils/sleeper.js';
import { getAllPlayersProjectedTotals } from './lib/projectionsService.js';
import { addEstimatedStdDev, calculateVORandDropoff } from './lib/vorUtils.js';
import { buildFinalPlayers } from './lib/transformPlayers.js';
import { getStarterPositions, getADPtype } from './utils/helpers.js';
import { getExpertData } from './experts.js';

export async function getDraftData(
  leagueId,
  { position = 'TODAS', byeCondition = 0, idExpert = 3701 } = {}
) {
  // 1. Datos base
  const [leagueData, season, mainUserId, tipoLiga] = await Promise.all([
    getSleeperLeague(leagueId),
    getConfigValue('season'),
    getConfigValue('main_user_id'),
    getConfigValue('dynasty')
  ]);

  const numTeams = leagueData.settings.num_teams;
  const starterPositions = getStarterPositions(leagueData);
  const superFlex = starterPositions.includes('SUPER_FLEX');
  const dynasty = leagueData.settings.type === 2 && tipoLiga === 'LIGA';

  const scoring =
    leagueData.scoring_settings?.rec === 1
      ? 'PPR'
      : leagueData.scoring_settings?.rec === 0.5
      ? 'HALF'
      : 'STANDARD';

  const adpType = getADPtype(scoring, dynasty, superFlex);
  const drafted = await getDraftPicks(leagueData.draft_id);
  const myDraft = getMainUserDraft(drafted, mainUserId);

  // 2. Rankings del experto
  const expertData = await getExpertData(idExpert);
  const finalPosition = superFlex && position === true ? 'SUPER FLEX' : position;

  const {
    players: rankings = [],
    published: ranks_published,
    source
  } = await getRankings({
    season,
    dynasty,
    scoring,
    expertData,
    position: finalPosition
  });

  if (!Array.isArray(rankings)) {
    throw new Error(`No se pudo obtener rankings para el experto ${idExpert}`);
  }

  let dstRankings = [];
  let kickerRankings = [];

  if (expertData.source !== 'flock') {
    if (starterPositions.includes('DEF')) {
      dstRankings = (await getDSTRankings({
        season,
        dynasty,
        expertData,
        weekStatic: null
      }))?.players?.map(p => ({
        ...p,
        rank: (typeof p.rank === 'number' ? p.rank : 9999) + 10000
      })) || [];
    }

    if (starterPositions.includes('K')) {
      kickerRankings = (await getKickerRankings({
        season,
        dynasty,
        expertData,
        weekStatic: null
      }))?.players?.map(p => ({
        ...p,
        rank: (typeof p.rank === 'number' ? p.rank : 9999) + 20000
      })) || [];
    }
  }

  // 3. Jugadores y ADP
  const adpData = await getADPData(adpType);
  const adpPlayerIds = adpData.map(p => p.sleeper_player_id);

  const allPlayerIds = new Set([
    ...adpPlayerIds,
    ...dstRankings.map(p => p.player_id),
    ...kickerRankings.map(p => p.player_id)
  ]);

  const playersData = await getPlayersData(Array.from(allPlayerIds));

  // 4. Proyecciones
  const projections = await getAllPlayersProjectedTotals(leagueId);

  const draftedMap = new Map(drafted.map(p => [String(p.player_id), p]));
  const positionMap = new Map(playersData.map(p => [String(p.player_id), p.position]));

  const enrichedProjections = projections.map(p => ({
    ...p,
    position: positionMap.get(String(p.player_id)) || null,
    status: draftedMap.has(p.player_id) ? 'DRAFTEADO' : 'LIBRE'
  }));

  const projectionsWithStdDev = addEstimatedStdDev(enrichedProjections);

  const vorList = calculateVORandDropoff(
    projectionsWithStdDev,
    starterPositions,
    numTeams
  );

  const vorMap = new Map(vorList.map(p => [p.player_id, p]));

  // 5. Construcción final
  const allRankings = [...rankings, ...dstRankings, ...kickerRankings];

  const players = buildFinalPlayers({
    adpData,
    playersData,
    rankings: allRankings,
    drafted,
    myDraft,
    num_teams: numTeams,
    byeCondition,
    projectionMap: new Map(
      projections.map(p => [p.player_id, p.total_projected])
    ),
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
      superFlex,
      ranks_published,
      ADPdate: adpData.length > 0 ? adpData[0].date : null,
      source
    },
    data: players
  };
}
