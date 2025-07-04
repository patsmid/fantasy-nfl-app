import { supabase } from './supabaseClient.js';
import axios from 'axios';

export async function getSleeperADP(req, res) {
  try {
    const { date, adp_type, player_id, since } = req.query;

    let query = supabase
      .from('sleeper_adp_data')
      .select('*')
      .order('adp_value', { ascending: true });

    if (date) query = query.eq('date', date);
    if (adp_type) query = query.eq('adp_type', adp_type);
    if (player_id) query = query.eq('sleeper_player_id', player_id);
    if (since) query = query.gte('date', since); // ✅ filtro por fecha mínima

    const { data, error } = await query;
    if (error) throw error;

    res.json({ success: true, data });
  } catch (err) {
    console.error('❌ Error en /sleeperADP:', err.message || err);
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getSleeperLeague(leagueId) {
  const { data } = await axios.get(`https://api.sleeper.app/v1/league/${leagueId}`);
  return data;
}

export async function getLeagueDraft(draftId) {
  const { data } = await axios.get(`https://api.sleeper.app/v1/draft/${draftId}/picks`);
  return data;
}

export async function updateSleeperADP(req, res) {
  try {
    const scriptUrl = 'https://script.google.com/macros/s/AKfycbzJKeM4mnNWbnIhGiOlRfCyEfccXfMVD8Zpp1300eRFVcRNgUGF7bZuRrd3D2xDXfYC/exec';
    const authKey = 'f4nt4sy-@dp-sync-92js83sk'; // Usa una variable de entorno segura

    const response = await fetch(`${scriptUrl}?auth=${authKey}`);
    const text = await response.text();

    res.json({ success: true, result: text });
  } catch (err) {
    console.error('❌ Error actualizando ADP:', err.message || err);
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getLatestADPDate(req, res) {
  try {
    const { data, error } = await supabase
      .from('sleeper_adp_data')
      .select('date')
      .order('date', { ascending: false })
      .limit(1);

    if (error) throw error;

    const latestDate = data?.[0]?.date;

    const clientModifiedSince = req.headers['if-modified-since'];
    if (clientModifiedSince && new Date(clientModifiedSince) >= new Date(latestDate)) {
      return res.status(304).end(); // ✅ No hay cambios
    }

    res.setHeader('Last-Modified', new Date(latestDate).toUTCString());
    res.json({ success: true, latestDate });
  } catch (err) {
    console.error('❌ Error en getLatestADPDate:', err.message || err);
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getADPTypes(req, res) {
  try {
    const { data, error } = await supabase
      .from('sleeper_adp_data')
      .select('adp_type')
      .neq('adp_type', null)
      .then((res) => {
        // Eliminar duplicados manualmente ya que Supabase no soporta `distinct` directo con JS SDK
        const unique = [...new Set(res.data.map(item => item.adp_type))];
        return { data: unique };
      });

    if (error) throw error;

    res.json({ success: true, adp_types: data });
  } catch (err) {
    console.error('❌ Error en getADPTypes:', err.message || err);
    res.status(500).json({ success: false, error: err.message });
  }
}
