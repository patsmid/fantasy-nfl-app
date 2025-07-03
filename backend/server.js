import express from 'express';
import { updatePlayers } from './updatePlayers.js';
import { updateNFLState } from './updateNFLState.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/update-nfl-state', async (req, res) => {
  try {
    await updateNFLState();
    res.json({ success: true, message: 'Estado NFL actualizado' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/update-players', async (req, res) => {
  try {
    await updatePlayers();
    res.json({ success: true, message: 'Jugadores actualizados' });
  } catch (err) {
    console.error('❌ Error desde /update-players:', err.message || err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(3000, () => {
  console.log('🚀 Servidor corriendo 3000, testeando');
});
