// services/espnService.js
import fetch from 'node-fetch';

export async function getNFLTeamsByeWeek() {
  const url = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2025?view=proTeamSchedules_wl';

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!data.proTeams) return [];

    const teams = data.proTeams.map(team => ({
      team: team.name,
      abbr: team.abbrev?.toUpperCase() ?? '',
      bye: team.byeWeek
    }));

    return teams;
  } catch (err) {
    console.error('Error fetching data from ESPN:', err.message);
    return [];
  }
}
