import { supabase } from '../supabaseClient.js';
import fetch from 'node-fetch';
import { getStarterPositions, getADPtype } from '../utils/helpers.js';
import { sleeperADPcols, positions } from '../utils/constants.js';

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

export async function getPlayersData(playerIds) {
  const { data } = await supabase.from('players').select('*').in('player_id', playerIds);
  return data;
}

export async function getRankings({ season, dynasty, scoring, idExpert, position }) {
  const week = 0;
  const posObj = positions.find(p => p.nombre === position) || positions.find(p => p.nombre === 'TODAS');
  const posValue = posObj.valor;
  const type = dynasty ? 'DK' : 'PRESEASON';
  const url = `https://partners.fantasypros.com/api/v1/expert-rankings.php?sport=NFL&year=${season}&week=${week}&id=${idExpert}&position=${posValue}&type=${type}&notes=false&scoring=${scoring}&export=json&host=ta`;
	console.log(url);
  const res = await fetch(url);
  return await res.json();
}
