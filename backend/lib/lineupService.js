import { getSleeperLeague, getRoster } from '../utils/sleeper.js';
import { getConfigValue, getPlayersData } from './draftUtils.js';
import { getRankings, getDSTRankings, getKickerRankings } from './rankingsService.js';
import { getStarterPositions, fuzzySearch } from '../utils/helpers.js';
import { generateLineup } from './lineupUtils.js';

export async function getLineupData(leagueId, { idExpert = 3701, position = 'TODAS' } = {}) {
  // 1. Datos de la liga y configuración
  const leagueData = await getSleeperLeague(leagueId);
  const starterPositions = getStarterPositions(leagueData);
  const superFlex = starterPositions.includes('SUPER_FLEX');
  const scoring =
    leagueData.scoring_settings?.rec === 1
      ? 'PPR'
      : leagueData.scoring_settings?.rec === 0.5
      ? 'HALF'
      : 'STANDARD';

  const tipoLiga = await getConfigValue('dynasty');
  const dynasty = leagueData.settings.type === 2 && tipoLiga === 'LIGA';
  const finalPosition = superFlex && position === 'TODAS' ? 'SUPER FLEX' : position;

  const season = await getConfigValue('season');
  const mainUserId = await getConfigValue('main_user_id');

  // 2. Rankings
  const { players: rankings, published } = await getRankings({
    season,
    dynasty,
    scoring,
    idExpert,
    position: finalPosition
  });
  const dstRankings = await getDSTRankings(idExpert);
  const kickerRankings = await getKickerRankings(idExpert);

  // 3. Roster del usuario
  const allRosters = await getRoster(leagueId);
  const myRoster = allRosters.find(r => r.owner_id === mainUserId);
  const playerIds = myRoster?.players ?? [];

  if (!playerIds || playerIds.length === 0) {
    throw new Error('Roster vacío o sin jugadores.');
  }

  // 4. Info de jugadores
  const playersData = await getPlayersData(playerIds);

  // 5. Construir arreglo de jugadores
  const players = playerIds.map((sleeperId) => {
    const info = playersData.find(p => p.player_id === String(sleeperId));
    if (!info) return null;

    const name = info.full_name;
    const isDST = info.position === 'DEF';
    const isK = info.position === 'K';
    const rankingList = isDST ? dstRankings : (isK ? kickerRankings : rankings);
    const ranked = fuzzySearch(name, rankingList);

    const playerRank = ranked[0] || {};
    const rank = ranked.length === 0 || info.injury_status === 'Out' ? 9999 : playerRank.rank;
    const matchup = playerRank.matchup || 'N/D';
    const byeWeek = playerRank.bye_week || info.bye_week || 'N/D';
    const rookie = info.years_exp === 0 ? ' (R)' : '';

    return {
      rank,
      nombre: `${info.full_name}${rookie}`,
      position: info.position,
      team: info.team,
      matchup,
      byeWeek,
      injuryStatus: info.injury_status || '',
      sleeperId
    };
  }).filter(Boolean);

  // 6. Ordenar por ranking
  players.sort((a, b) => a.rank - b.rank);

  // 7. Generar titulares y banca
  const [starters, bench] = generateLineup(players, starterPositions);

  return {
    meta: {
      scoring,
      dynasty,
      superFlex,
      published
    },
    starters,
    bench
  };
}
