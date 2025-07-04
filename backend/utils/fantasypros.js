import axios from 'axios';

export async function getDraftRankings({ season, week, expertId, position, scoring = 'PPR', dynasty = true }) {
  const type = dynasty ? 'DK' : (week > 0 ? 'WEEKLY' : 'PRESEASON');

  const url = `https://partners.fantasypros.com/api/v1/expert-rankings.php?sport=NFL&year=${season}&week=${week}&id=${expertId}&position=${position}&type=${type}&notes=false&scoring=${scoring}&export=json&host=ta`;

  const { data } = await axios.get(url);
  return data.players || [];
}
