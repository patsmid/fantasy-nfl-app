import fetch from 'node-fetch';
import { getNflState, getSleeperLeague, getPlayoffsData } from '../utils/sleeper.js';

export async function getTotalProjections(leagueId) {
  const { season } = await getNflState();
  const leagueData = await getSleeperLeague(leagueId);
  const scoringSettings = leagueData.scoring_settings;

  const regularSeasonLength = leagueData.settings.playoff_week_start - 1;
  const playoffs = await getPlayoffsData(leagueId);
  const playoffLength = playoffs.at(-1)?.r || 0;
  const fullSeasonLength = regularSeasonLength + playoffLength;

  const allProjections = new Map();

  for (let week = 1; week <= fullSeasonLength; week++) {
    const url = `https://api.sleeper.app/projections/nfl/${season}/${week}?season_type=regular&position[]=DB&position[]=DEF&position[]=DL&position[]=FLEX&position[]=IDP_FLEX&position[]=K&position[]=LB&position[]=QB&position[]=RB&position[]=REC_FLEX&position[]=SUPER_FLEX&position[]=TE&position[]=WR&position[]=WRRB_FLEX&order_by=ppr`;

    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`⚠️ Falló la semana ${week}: ${res.statusText}`);
      continue;
    }

    const weekProjections = await res.json();

    for (const entry of weekProjections) {
      const id = entry.player_id;
      const projectedPoints = calculateProjection(entry.stats, scoringSettings);

      if (!allProjections.has(id)) {
        allProjections.set(id, {
          player_id: id,
          total_ppr: 0,
          position: entry.player?.position || entry.player?.fantasy_positions?.[0] || '',
        });
      }

      allProjections.get(id).total_ppr += projectedPoints;
    }
  }

  return Array.from(allProjections.values());
}

export function calculateProjection(projectedStats = {}, scoringSettings = {}) {
  let score = 0;
  for (const stat in projectedStats) {
    const multiplier = scoringSettings[stat] || 0;
    score += projectedStats[stat] * multiplier;
  }
  return score;
}
