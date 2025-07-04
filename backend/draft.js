// draft.js
import express from 'express';
import { supabase } from './supabaseClient.js';
import fetch from 'node-fetch';

const router = express.Router();

const sleeperADPcols = [
  { type: 'PPR', description: 'Redraft PPR ADP' },
  { type: 'SF', description: 'Redraft SF ADP' },
  { type: 'HALF', description: 'Redraft Half PPR ADP' },
  { type: 'DYNASTY_PPR', description: 'Dynasty PPR ADP' },
  { type: 'DYNASTY_SF', description: 'Dynasty SF ADP' },
  { type: 'DYNASTY_HALF', description: 'Dynasty Half PPR ADP' },
];

function getADPDescription({ dynasty, scoring, superFlex }) {
  const typeKey = dynasty
    ? (superFlex ? 'DYNASTY_SF' : `DYNASTY_${scoring}`)
    : (superFlex ? 'SF' : scoring);

  const found = sleeperADPcols.find(adp => adp.type === typeKey);
  console.log(found?.description || 'Redraft PPR ADP');
  return found?.description || 'Redraft PPR ADP';
}

async function getADPfromSupabase(adpTypeDescription) {
  const { data, error } = await supabase
    .from('sleeper_adp_data')
    .select('sleeper_player_id, adp_value, adp_value_prev')
    .eq('adp_type', adpTypeDescription);

  if (error) throw error;

  const map = new Map();
  data.forEach(row => {
    map.set(row.sleeper_player_id, {
      adp: parseFloat(row.adp_value) || 500,
      adp_prev: parseFloat(row.adp_value_prev) || 500,
    });
  });
  console.log("adp from supabase");
  console.log(map);
  return map;
}

async function getPlayersMeta() {
  const { data, error } = await supabase
    .from('players')
    .select('player_id, full_name, position, team, status, injury_status, years_exp');

  if (error) throw error;

  const map = new Map();
  data.forEach(p => {
    map.set(p.player_id, p);
  });
    console.log("getPlayersMeta");
  console.log(map);
  return map;
}

router.get('/draft/:leagueId', async (req, res) => {
  try {
    const { leagueId } = req.params;
    const dynasty = req.query.dynasty === 'true';

    const leagueRes = await fetch(`https://api.sleeper.app/v1/league/${leagueId}`);
    if (!leagueRes.ok) {
      return res.status(404).json({ error: 'Liga no encontrada en Sleeper' });
    }
    const league = await leagueRes.json();

    const scoring = league.scoring_settings.rec === 1 ? 'PPR'
      : league.scoring_settings.rec === 0.5 ? 'HALF'
      : 'STANDARD';

    const starterPositions = league.roster_positions || [];
    const superFlex = starterPositions.includes('SUPER_FLEX');
    const numTeams = league.settings.num_teams || 12;

    const adpTypeDescription = getADPDescription({ dynasty, scoring, superFlex });
    const adpMap = await getADPfromSupabase(adpTypeDescription);
    const playerMetaMap = await getPlayersMeta();

    const draftRes = await fetch(`https://api.sleeper.app/v1/draft/${league.draft_id}/picks`);
    if (!draftRes.ok) {
      return res.status(404).json({ error: 'Draft no encontrado en Sleeper' });
    }
    const drafted = await draftRes.json();
    const draftedSet = new Set(drafted.map(p => p.player_id));

    console.log("getPlayersMeta");
  console.log(drafted);

    const players = [];
    for (const [playerId, adpInfo] of adpMap.entries()) {
      const meta = playerMetaMap.get(playerId);
      console.log(meta);
      if (!meta) continue;

      const adp = adpInfo.adp;
      const adp_prev = adpInfo.adp_prev;
      const adp_diff = adp_prev - adp;

      // Etiquetas de valor y riesgo
      let value_tag = '';
      if (adp_diff >= 20) value_tag = '🟢 Valor';
      else if (adp_diff <= -20) value_tag = '🔴 Riesgo';

      // Novato
      const rookie_tag = meta.years_exp === 0 ? '🧪 Rookie' : '';

      players.push({
        sleeper_player_id: playerId,
        name: meta.full_name,
        position: meta.position,
        team: meta.team,
        status: draftedSet.has(playerId) ? 'DRAFTEADO' : 'LIBRE',
        injury_status: meta.injury_status,
        years_exp: meta.years_exp,
        adp,
        adp_prev,
        adp_diff,
        adp_round: (Math.ceil(adp / numTeams)).toFixed(2),
        value_tag,
        rookie_tag
      });
    }

    players.sort((a, b) => a.adp - b.adp);

    res.json(players);
  } catch (err) {
    console.error('Error en /draft/:leagueId:', err.message);
    res.status(500).json({ error: 'Error generando draft' });
  }
});

export default router;
