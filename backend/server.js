import express from 'express';
import cors from 'cors';
import { updatePlayers } from './updatePlayers.js';
import { updateNFLState } from './updateNFLState.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Configura CORS para permitir acceso desde cualquier origen
app.use(cors());
app.use(express.json());

// Ruta para obtener los jugadores y enviarlos al frontend
app.get('/players', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .order('full_name');

    if (error) throw error;

    res.json({ success: true, data });
  } catch (err) {
    console.error('❌ Error en /players:', err.message || err);
    res.status(500).json({ success: false, error: err.message });
  }
});

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
  console.log(`🚀 Servidor corriendo en: ${PORT}`);
});
