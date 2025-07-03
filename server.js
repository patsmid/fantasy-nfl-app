import express from 'express';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

const supabaseUrl = 'https://cdmesdcgkcvogbgzqobt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkbWVzZGNna2N2b2diZ3pxb2J0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE1NjM3ODIsImV4cCI6MjA2NzEzOTc4Mn0.QODh_sgbLeqNzYkXp8Ng3HflGaqBw5rf_sZHxanpZH8';
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(cors());
app.use(express.json());

app.get('/api/players', async (req, res) => {
  const { data, error } = await supabase.from('players').select('*');
  if (error) return res.status(500).json({ error });
  res.json(data);
});

app.post('/api/update-players', async (req, res) => {
  try {
    const response = await fetch('https://api.sleeper.app/v1/players/nfl');
    const rawData = await response.json();

    const players = Object.values(rawData)
      .filter(p => p.full_name && p.position && p.team)
      .map(p => ({
        player_id: p.player_id,
        full_name: p.full_name,
        position: p.position,
        team: p.team,
        status: p.status,
        injury_status: p.injury_status || null,
        years_exp: p.years_exp || null,
      }));

    const { error } = await supabase
      .from('players')
      .upsert(players, { onConflict: ['player_id'] });

    if (error) throw error;

    res.json({ message: 'Jugadores actualizados correctamente.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
