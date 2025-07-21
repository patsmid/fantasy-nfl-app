import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

const TYPES = {
  'half-ppr': 'half-point-ppr-overall',
  'ppr': 'ppr-overall'
};

export async function getFantasyProsADP(type = 'half-ppr') {
  if (!TYPES[type]) throw Error('Tipo inválido');
  const url = `https://www.fantasypros.com/nfl/adp/${TYPES[type]}.php`;
  const $ = cheerio.load(await fetch(url, {headers:{'User-Agent':'Mozilla/5.0'}}).then(r=>r.text()));
  const table = $('#data');
  const headers = table.find('thead th').map((i,el)=>$(el).text().trim().toLowerCase()).get();
  console.log('Encabezados:', headers);

  const players = [];
  table.find('tbody tr').each((_,tr)=>{
    const cols = $(tr).find('td');
    const obj = {};
    cols.each((i,td)=>{
      obj[headers[i]] = $(td).text().trim();
    });

    let name='Desconocido', team=null, bye=null;
    const raw = obj['player'] || obj['player team (bye)'] || obj['player (team bye)'];
    if (raw) {
      const m = raw.match(/^(.*?)\s+([A-Z]{2,3})\s*\((\d{1,2})\)$/);
      if (m) [ , name, team, bye ] = m;
      else name = raw;
    }

    players.push({
      rank: parseInt(obj['#']||obj['rank'])||null,
      name,
      team,
      position: obj['pos']||obj['position']||null,
      bye,
      adp: parseFloat(obj['adp']||obj['ppr adp']||obj['avg'])||null
    });
  });

  return players;
}
