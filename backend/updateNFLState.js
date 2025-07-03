import fetch from 'node-fetch';
import { supabase } from './supabaseClient.js';

export async function updateNFLState() {
  const apiUrl = 'https://api.sleeper.app/v1/state/nfl';

  const allowedFields = [
    'week',
    'season_type',
    'season_start_date',
    'season',
    'previous_season',
    'leg',
    'league_season',
    'league_create_season',
    'display_week'
  ];

  try {
    const response = await fetch(apiUrl);
    const rawData = await response.json();

    const filteredData = {};
    for (const field of allowedFields) {
      if (field in rawData) filteredData[field] = rawData[field];
    }
    filteredData.updated_at = new Date().toISOString();

    const { data: existing, error: fetchError } = await supabase
      .from('nfl_state')
      .select('id')
      .limit(1)
      .maybeSingle();

    if (fetchError) throw fetchError;

    if (existing) {
      const { error: updateError } = await supabase
        .from('nfl_state')
        .update(filteredData)
        .eq('id', existing.id);

      if (updateError) throw updateError;

      console.log('✅ Registro actualizado en nfl_state:', filteredData);
    } else {
      const { error: insertError } = await supabase
        .from('nfl_state')
        .insert([filteredData]);

      if (insertError) throw insertError;

      console.log('✅ Registro insertado en nfl_state:', filteredData);
    }
  } catch (err) {
    console.error('❌ Error en updateNFLState:', err.message || err);
  }
}
