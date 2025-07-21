import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

export async function getFantasyProsADP(type = 'half-ppr') {
  const validTypes = {
    'half-ppr': 'half-point-ppr-overall',
    'ppr': 'ppr-overall'
  };

  if (!validTypes[type]) throw new Error('ADP type inválido');

  const url = `https://www.fantasypros.com/nfl/adp/${validTypes[type]}.php`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();
  const $ = cheerio.load(html);

  const table = $('#data');
  const headers = [];

  table.find('thead tr th').each((i, el) => {
    const header = $(el).text().trim().toLowerCase();
    headers.push(header); // ej: 'player', 'team', 'position', 'bye', 'adp'
  });

  const players = [];

  table.find('tbody tr').each((i, el) => {
    const td = $(el).find('td');
    if (td.length < headers.length) return;

    const row = {};
    td.each((j, cell) => {
      const key = headers[j];
      const value = $(cell).text().trim();

      row[key] = value;
    });

    // Mapeamos los campos que nos interesan
    const [name, team, bye] = row['player']?.split(/\s+\(|\)/) ?? [];

    players.push({
      rank: parseInt(row['#'] || i + 1),
      name: name?.trim() || row['player'],
      team: team || row['team'],
      position: row['pos'] || row['position'],
      bye: row['bye'] || null,
      adp: parseFloat(row['adp']) || null,
    });
  });

  return players;
}
