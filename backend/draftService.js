import { supabase } from './supabaseClient.js';
import fetch from 'node-fetch';
import { fuzzySearch, getStarterPositions, getADPtype } from './utils/helpers.js';

const goodOffense = ['KC', 'HOU', 'SF', 'CIN', 'PHI', 'MIA', 'BAL', 'DET', 'BUF', 'GB', 'LAR', 'ATL', 'JAX', 'CHI'];

export async function getDraftData(leagueId) {
  const byeCondition = 0;

  // 1. Obtener datos de liga
  const leagueRes = await fetch(`https://api.sleeper.app/v1/league/${leagueId}`);
  const leagueData = await leagueRes.json();
  const num_teams = leagueData.settings.num_teams;

  const starterPositions = getStarterPositions(leagueData);
  const superFlex = starterPositions.includes('SUPER_FLEX');
  const dynasty = leagueData.settings.type === 'dynasty';

  // 2. Calcular tipo de ADP
  const adpType = getADPtype(
    leagueData.settings.scoring_settings,
    dynasty,
    superFlex
  );

  // 3. Obtener picks del draft
  const draftRes = await fetch(`https://api.sleeper.app/v1/draft/${leagueData.draft_id}/picks`);
  const drafted = await draftRes.json();
  const draftedMap = new Map(drafted.map(p => [String(p.player_id), p]));

  // 4. Obtener ID de usuario principal desde config
  const { data: configData } = await supabase
    .from('config')
    .select('value')
    .eq('key', 'main_user_id')
    .single();
  const mainUserId = configData?.value;
  const myDraft = drafted.filter(p => p.picked_by === mainUserId);

  // 5. Obtener ADP actual desde Supabase
  const { data: adpData } = await supabase
    .from('sleeper_adp_data')
    .select('*')
    .eq('adp_type', adpType);

  // 6. Filtrar jugadores solo para IDs en ADP para evitar límite 1000
  const playerIds = adpData.map(p => p.sleeper_player_id);

  const { data: playersData } = await supabase
    .from('players')
    .select('*')
    .in('player_id', playerIds);

  // 7. Obtener rankings FantasyPros
  const expertId = 3701; // Fijo como pediste
  const week = 0;
  const position = 'ALL';
  const scoring = 'PPR';
  const type = dynasty ? 'DK' : 'PRESEASON';

  const rankURL = `https://partners.fantasypros.com/api/v1/expert-rankings.php?sport=NFL&year=2025&week=${week}&id=${expertId}&position=${position}&type=${type}&notes=false&scoring=${scoring}&export=json&host=ta`;
  const rankings = await fetch(rankURL).then(res => res.json());

  // 8. Analizar bye weeks y equipos de mis picks
  const myByeWeeks = [];
  const myteams = [];
  myDraft.forEach(item => {
    const ranked = fuzzySearch(`${item.metadata.first_name} ${item.metadata.last_name}`, rankings.players);
    if (ranked[0]) {
      myByeWeeks.push(ranked[0].bye_week);
      myteams.push(ranked[0].player_team_id);
    }
  });

  // 9. Generar lista final de jugadores
  const players = [];

  for (const adp of adpData) {
    const playerId = String(adp.sleeper_player_id);
    const playerInfo = playersData.find(p => p.player_id === playerId);
    if (!playerInfo) continue;

    const adpValue = adp.adp_value;
    const adpBefore = adp.adp_value_prev || 500;
    const playerDrafted = draftedMap.has(playerId) ? '' : 'LIBRE';

    const fullName = playerInfo.full_name;
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
      status: playerDrafted,
      adpRound: adpRound.toFixed(2),
      adpDiff: adpBefore - adpValue
    });
  }

  return players.sort((a, b) => a.rank - b.rank);
}
