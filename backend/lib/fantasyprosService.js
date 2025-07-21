import fetch from 'node-fetch';
import * as cheerio from 'cheerio'; // CORRECTO para ESM

export async function getFantasyProsADP() {
  const url = 'https://www.fantasypros.com/nfl/adp/half-point-ppr-overall.php';

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });

  const html = await res.text();
  const $ = cheerio.load(html);

  const players = [];

  $('#data tbody tr').each((i, el) => {
    const td = $(el).find('td');
    if (td.length < 6) return;

    players.push({
      rank: Number($(td[0]).text().trim()),
      name: $(td[1]).text().trim(),
      team: $(td[2]).text().trim(),
      position: $(td[3]).text().trim(),
      bye: $(td[4]).text().trim(),
      adp: Number($(td[5]).text().trim())
    });
  });

  return players;
}
