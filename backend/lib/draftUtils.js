import { supabase } from '../supabaseClient.js';
import fetch from 'node-fetch';
import { getStarterPositions, getADPtype } from '../utils/helpers.js';
import { sleeperADPcols, positions } from '../utils/constants.js';
import { getNflState } from '../utils/sleeper.js';

export async function getConfigValue(key) {
  const { data, error } = await supabase.from('config').select('value').eq('key', key).single();
  if (error) throw new Error(`Error leyendo config: ${key}`);
  return data?.value;
}

export async function getDraftPicks(draftId) {
  const res = await fetch(`https://api.sleeper.app/v1/draft/${draftId}/picks`);
  if (!res.ok) throw new Error(`Error al obtener picks: ${res.status}`);
  return await res.json();
}

export function getMainUserDraft(picks, mainUserId) {
  return picks.filter(p => p.picked_by === mainUserId);
}

export async function getADPData(adpType) {
  const adpConfig = sleeperADPcols.find(col => col.type === adpType);
  if (!adpConfig) throw new Error(`Tipo de ADP '${adpType}' no encontrado`);
  const { data } = await supabase.from('sleeper_adp_data').select('*').eq('adp_type', adpConfig.description);
  return data;
}

export async function getPlayersData(playerIds = null, chunkSize = 1000) {
  // Caso 1: hay playerIds → filtramos por in()
  if (Array.isArray(playerIds) && playerIds.length > 0) {
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .in('player_id', playerIds);

    if (error) throw error;
    return data || [];
  }

  // Caso 2: no hay playerIds → traer toda la tabla en chunks
  let allPlayers = [];
  let from = 0;
  let to = chunkSize - 1;
  let finished = false;

  while (!finished) {
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .range(from, to);

    if (error) throw error;

    if (!data || data.length === 0) {
      finished = true; // no hay más registros
    } else {
      allPlayers = allPlayers.concat(data);
      from += chunkSize;
      to += chunkSize;
    }
  }

  return allPlayers;
}

export async function getPlayersByNames(names = []) {
  if (!Array.isArray(names) || names.length === 0) return [];
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .in('full_name', names);
  if (error) throw error;
  return data || [];
}

export async function getRankings_prev({ season, dynasty, scoring, idExpert, position }) {
  const week = 0;
  const posObj = positions.find(p => p.nombre === position) || positions.find(p => p.nombre === 'TODAS');
  const posValue = posObj.valor;
  const type = dynasty ? 'DK' : 'PRESEASON';
  const url = `https://partners.fantasypros.com/api/v1/expert-rankings.php?sport=NFL&year=${season}&week=${week}&id=${idExpert}&position=${posValue}&type=${type}&notes=false&scoring=${scoring}&export=json&host=ta`;
	console.log(url);
  const res = await fetch(url);
  return await res.json();
}

export async function getRankings({ season, dynasty, scoring, idExpert, position, weekStatic = null }) {
  const nflState = await getNflState();
  let week = 0;

  if (nflState.season_type === 'pre') {
    week = 0;
  } else {
    week = nflState.week;
  }

  if (weekStatic !== null && weekStatic !== '') {
    week = parseInt(weekStatic);
  }

  let pos = position;
  if (position === 'TODAS' && (nflState.season_type === 'pre' || week === 0)) {
    pos = 'TODAS_PRE';
  }

  const posObj = positions.find(p => p.nombre === pos) || positions.find(p => p.nombre === 'TODAS');
  const posValue = posObj.valor;

  let type = 'PRESEASON';
  if (week > 0) type = 'WEEKLY';
  if (dynasty) type = 'DK';

  const url = `https://partners.fantasypros.com/api/v1/expert-rankings.php?sport=NFL&year=${season}&week=${week}&id=${idExpert}&position=${posValue}&type=${type}&notes=false&scoring=${scoring}&export=json&host=ta`;
  console.log('📊 URL Rankings:', url);

  const res = await fetch(url);
  return await res.json();
}

export async function getFantasyCalcADPData({
  scoring = 'ppr',
  teams = '10',
  dynasty = true,
  type = 'Startup',
  pos = 'TODAS'
}) {
  const today = new Date();
  const startDate = formatDate(subtractDays(today, 30));
  const endDate = formatDate(today);

  const positions = [
    { nombre: 'QB', valor: 'QB' },
    { nombre: 'RB', valor: 'RB' },
    { nombre: 'WR', valor: 'WR' },
    { nombre: 'TE', valor: 'TE' },
    { nombre: 'OP', valor: 'OP' },
    { nombre: 'TODAS', valor: 'ALL' }
  ];

  const position = positions.find(p => p.nombre === pos)?.valor || 'ALL';
  const superFlex = (position === 'OP') ? 2 : 1;
  const pprValue = scoring.toLowerCase() === 'half' ? '0.5' : '1';

  const baseUrl = 'https://api.fantasycalc.com/adp';
  const query = `isDynasty=${dynasty}&numTeams=${teams}&ppr=${pprValue}&numQbs=${superFlex}&draftType=${type}&startDate=${startDate}&endDate=${endDate}`;
  const url = `${baseUrl}?${query}`;

  const response = await fetch(url);
  const data = await response.json();

  if (type === 'Startup') {
    const rookieUrl = `${baseUrl}?isDynasty=${dynasty}&numTeams=${teams}&ppr=${pprValue}&numQbs=${superFlex}&draftType=Rookie&startDate=${startDate}&endDate=${endDate}`;
    const rookieResponse = await fetch(rookieUrl);
    const rookieData = await rookieResponse.json();

    return {
      veterans: data.adp,
      rookies: rookieData.adp
    };
  }

  return data.adp;
}
