import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(cors());
app.use(express.json());

const supabaseUrl = 'https://cdmesdcgkcvogbgzqobt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkbWVzZGNna2N2b2diZ3pxb2J0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE1NjM3ODIsImV4cCI6MjA2NzEzOTc4Mn0.QODh_sgbLeqNzYkXp8Ng3HflGaqBw5rf_sZHxanpZH8';
const supabase = createClient(supabaseUrl, supabaseKey);

app.get('/update-nfl-state', async (req, res) => {
  await updateNFLState();
  res.json({ status: 'ok' });
});

app.get('/update-players', async (req, res) => {
  try {
    const response = await fetch('https://api.sleeper.app/v1/players/nfl');
    const players = await response.json();
    const data = Object.values(players).map(player => ({
      player_id: player.player_id,
			first_name: player.first_name,
			last_name: player.last_name,
      full_name: player.full_name,
      position: player.position,
      team: player.team,
      status: player.status,
      injury_status: player.injury_status,
      years_exp: player.years_exp
    })).filter(p => p.player_id);

    for (const player of data) {
      await supabase.from('players').upsert(player, { onConflict: 'player_id' });
    }

    res.json({ success: true, updated: data.length });
  } catch (error) {
		console.log("error");
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(3000, () => {
  console.log('Server is running on port 3000, testeando');
});

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
    'display_week',
  ];

  try {
    const response = await fetch(apiUrl);
    const rawData = await response.json();

    // Filtramos solo campos válidos
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
      console.log('✅ Registro actualizado en nfl_state');
    } else {
      const { error: insertError } = await supabase
        .from('nfl_state')
        .insert([filteredData]);
      if (insertError) throw insertError;
      console.log('✅ Registro insertado en nfl_state');
    }
  } catch (err) {
    console.error('❌ Error en updateNFLState:', err.message || err);
  }
}
