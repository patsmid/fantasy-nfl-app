import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { supabase } from '../supabaseClient.js';

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

export async function uploadFantasyProsADP(tipo = 'ppr') {
  try {
    const adp_type = `FP_${tipo}`;
    const adpList = await getFantasyProsADP(tipo); // [{ rank, name, team, position, bye, adp }]

    const today = new Date().toISOString().split('T')[0];

    const records = adpList.map(player => ({
      adp_type,
      sleeper_player_id: 0,
      adp_value: Number(player.adp),
      adp_value_prev: 0,
      date: today,
      full_name: player.name,
      position: player.position,
      team: player.team,
    }));

    const { data, error } = await supabase
      .from('sleeper_adp_data')
      .insert(records);

    if (error) throw error;

    console.log(`✅ Insertados ${records.length} registros de ADP [${adp_type}]`);
  } catch (err) {
    console.error('❌ Error al subir datos de FantasyPros:', err.message || err);
  }
}

export async function uploadAllFantasyProsADP() {
  const tipos = ['ppr', 'half-ppr'];
  await Promise.all(tipos.map(uploadFantasyProsADP));
  console.log('🎉 ADP de FantasyPros cargado para PPR y Half-PPR');
}
