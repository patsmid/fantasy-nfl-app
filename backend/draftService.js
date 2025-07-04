import { supabase } from './supabaseClient.js';
import fetch from 'node-fetch';
import { fuzzySearch, getStarterPositions, getADPtype } from './utils/helpers.js';
import { sleeperADPcols, positions } from './utils/constants.js';

const goodOffense = ['KC', 'HOU', 'SF', 'CIN', 'PHI', 'MIA', 'BAL', 'DET', 'BUF', 'GB', 'LAR', 'ATL', 'JAX', 'CHI'];

export async function getDraftData(leagueId, { position = 'TODAS', byeCondition = 0, idExpert = 3701 } = {}) {
  // 1. Obtener datos de liga
  const leagueRes = await fetch(`https://api.sleeper.app/v1/league/${leagueId}`);
  const leagueData = await leagueRes.json();
  const num_teams = leagueData.settings.num_teams;

  const starterPositions = getStarterPositions(leagueData);
  const superFlex = starterPositions.includes('SUPER_FLEX');

  // 2. Obtener tipo de liga desde config
  const { data: configData } = await supabase
    .from('config')
    .select('value')
    .eq('key', 'dynasty')
    .single();

  const tipoLiga = configData?.value;
  const dynasty = leagueData.settings.type === 2 && tipoLiga === 'LIGA';

  // 3. Obtener tipo de scoring y ADP
  const scoring = (
    leagueData.scoring_settings?.rec === 1 ? 'PPR' :
    leagueData.scoring_settings?.rec === 0.5 ? 'HALF' :
    'STANDARD'
  );

  const adpType = getADPtype(scoring, dynasty, superFlex);
  const adpConfig = sleeperADPcols.find(col => col.type === adpType);
  if (!adpConfig) throw new Error(`Tipo de ADP '${adpType}' no encontrado`);
  const adpDescription = adpConfig.description;

  // 4. Obtener picks del draft
  const draftRes = await fetch(`https://api.sleeper.app/v1/draft/${leagueData.draft_id}/picks`);
  const drafted = await draftRes.json();
  const draftedMap = new Map(drafted.map(p => [String(p.player_id), p]));

  // 5. Obtener ID de usuario principal desde config
  const { data: configMainUser } = await supabase
    .from('config')
    .select('value')
    .eq('key', 'main_user_id')
    .single();

  const mainUserId = configMainUser?.value;
  const myDraft = drafted.filter(p => p.picked_by === mainUserId);

  // 6. Obtener ADP actual desde Supabase
  const { data: adpData } = await supabase
    .from('sleeper_adp_data')
    .select('*')
    .eq('adp_type', adpDescription);

  const playerIds = adpData.map(p => p.sleeper_player_id);
  const { data: playersData } = await supabase
    .from('players')
    .select('*')
    .in('player_id', playerIds);

  // 7. Obtener rankings FantasyPros
  const week = 0;
  const posObj = positions.find(p => p.nombre === position) || positions.find(p => p.nombre === 'TODAS');
  const posValue = posObj.valor;
  const type = dynasty ? 'DK' : 'PRESEASON';

  const rankURL = `https://partners.fantasypros.com/api/v1/expert-rankings.php?sport=NFL&year=2025&week=${week}&id=${idExpert}&position=${posValue}&type=${type}&notes=false&scoring=${scoring}&export=json&host=ta`;
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

    if (!playerInfo || !playerInfo.full_name) continue;
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
    data: players.sort((a, b) => a.rank - b.rank)
  };
}
