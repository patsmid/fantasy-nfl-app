import express from 'express';
import cors from 'cors';
import { getPlayersRAW, getPlayers, updatePlayers } from './players.js';
import { updateNFLState } from './updateNFLState.js';
import { getAllConfig, getConfig, setConfig } from './configController.js';
import { getLeagues, getLeaguesFromDB, updateLeagues, getLeagueById, updateLeagueDynasty } from './leagues.js';
import {
  getAllExperts,
  getExpertById,
  createExpert,
  updateExpert,
  deleteExpert
} from './experts.js';
import { getSleeperADP, getLatestADPDate, getADPTypes, updateSleeperADP, getUniqueSleeperADPValues  } from './utils/sleeper.js';
import draftRouter from './draft.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Configura CORS para permitir acceso desde cualquier origen
app.use(cors());
app.use(express.static('frontend'));
app.use(express.json());

// CORS config
app.use(cors({
  origin: 'https://fantasy-nfl-app.onrender.com', // Tu frontend
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

// Ruta para obtener los jugadores y enviarlos al frontend
app.get('/playersRAW', getPlayersRAW);

app.get('/players', getPlayers);

app.get('/update-players', async (req, res) => {
  try {
    await updatePlayers();
    res.json({ success: true, message: 'Jugadores actualizados' });
  } catch (err) {
    console.error('❌ Error desde /update-players:', err.message || err);
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

app.get('/config', getAllConfig);
app.get('/config/:key', getConfig);
app.post('/config', setConfig);

app.get('/leagues/sleeper', getLeagues);         // Opción directa desde API Sleeper
app.get('/leagues', getLeaguesFromDB);           // desde base de datos
app.get('/update-leagues', updateLeagues);       // Actualiza desde API → Supabase
app.get('/leagues/:id', getLeagueById); // 🆕 Consultar una liga por ID
app.patch('/leagues/:id/dynasty', updateLeagueDynasty); // 🆕 Actualizar campo dynasty

// Rutas de expertos
app.get('/experts', getAllExperts);
app.get('/experts/:id', getExpertById);
app.post('/experts', createExpert);
app.put('/experts/:id', updateExpert);
app.delete('/experts/:id', deleteExpert);

// Ruta sleeperADP
app.get('/sleeperADP', getSleeperADP);               // datos completos
app.get('/sleeperADP/latest-date', getLatestADPDate); // fecha más reciente
app.get('/sleeperADP/types', getADPTypes);            // tipos de ADP únicos
app.post('/update-sleeper-adp', updateSleeperADP);
app.get('/sleeperADP/unique-values', getUniqueSleeperADPValues);

app.use('/draft', draftRouter);

//////////////////////////////////////////////////////////////////////////////////////////////////////////////
///FUNCIONES DEL SERVIDOR
//////////////////////////////////////////////////////////////////////////////////////////////////////////////

app.get('/', (req, res) => {
  res.send('✅ API Fantasy NFL en línea');
});

app.listen(3000, () => {
  console.log(`🚀 Servidor corriendo en: ${PORT}`);
});
