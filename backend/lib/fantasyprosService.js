import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

const TYPE_MAP = {
  'half-ppr': 'half-point-ppr-overall',
  'ppr': 'ppr-overall'
};

export async function getFantasyProsADP(type = 'half-ppr') {
  if (!TYPE_MAP[type]) throw new Error('Tipo inválido');

  const url = `https://www.fantasypros.com/nfl/adp/${TYPE_MAP[type]}.php`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const $ = cheerio.load(await res.text());
  const table = $('#data');

  // 1. Mapear encabezados
  const headers = [];
  table.find('thead th').each((i, el) => {
    headers.push($(el).text().trim().toLowerCase());
  });

  const players = [];
  table.find('tbody tr').each((_, tr) => {
    const cols = $(tr).find('td');
    if (cols.length < headers.length) return;

    const obj = {};
    cols.each((j, td) => {
      obj[headers[j]] = $(td).text().trim();
    });

    // Extraer nombre y equipo desde el campo "player"
    const raw = obj['player'] || obj['name'];
    const match = raw.match(/^(.*?)\s+([A-Z]{2,3})\s*\((\d+)\)$/);
    let name = raw, team, bye;
    if (match) {
      name = match[1].trim();
      team = match[2];
      bye = match[3];
    }

    players.push({
      rank: parseInt(obj['#'] || obj['rank']) || null,
      name,
      team: team || obj['team'] || null,
      position: obj['pos'] || obj['position'] || null,
      bye: bye || obj['bye'] || null,
      adp: parseFloat(obj['adp']) || null
    });
  });

  return players;
}
