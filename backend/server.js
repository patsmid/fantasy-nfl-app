import express from 'express';
import cors from 'cors';
import {
  getPlayersRAW, getPlayers, updatePlayers
} from './players.js';
import { updateNFLState } from './updateNFLState.js';
import {
  getAllConfig, getConfig, setConfig
} from './configController.js';
import {
  getLeagues, getLeaguesFromDB, updateLeagues, getLeagueById, updateLeagueDynasty
} from './leagues.js';
import {
  getAllExperts, getExpertById, createExpert, updateExpert, deleteExpert
} from './experts.js';
import {
  getSleeperADP, getLatestADPDate, getADPTypes,
  updateSleeperADP, getUniqueSleeperADPValues
} from './utils/sleeper.js';
import { getNFLTeamsByeWeek } from './lib/teamsService.js';
import draftRouter from './draft.js';
import projectionsRouter from './projections.js';
import rankingsRouter from './rankings.js';
import extrasRouter from './extras.js';

const app = express();
const PORT = process.env.PORT || 3000;

// 🌐 Middlewares
app.use(cors({
  origin: 'https://fantasy-nfl-app.onrender.com',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
app.use(express.static('frontend'));
app.use(express.json());

// 🏈 Jugadores
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

// 🔄 NFL State
app.get('/update-nfl-state', async (req, res) => {
  try {
    await updateNFLState();
    res.json({ success: true, message: 'Estado NFL actualizado' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ⚙️ Configuración
app.get('/config', getAllConfig);
app.get('/config/:key', getConfig);
app.post('/config', setConfig);

// 🏆 Ligas
app.get('/leagues/sleeper', getLeagues);
app.get('/leagues', getLeaguesFromDB);
app.get('/update-leagues', updateLeagues);
app.get('/leagues/:id', getLeagueById);
app.patch('/leagues/:id/dynasty', updateLeagueDynasty);

// 🧠 Expertos
app.get('/experts', getAllExperts);
app.get('/experts/:id', getExpertById);
app.post('/experts', createExpert);
app.put('/experts/:id', updateExpert);
app.delete('/experts/:id', deleteExpert);

// 📊 Sleeper ADP
app.get('/sleeperADP', getSleeperADP);
app.get('/sleeperADP/latest-date', getLatestADPDate);
app.get('/sleeperADP/types', getADPTypes);
app.post('/update-sleeper-adp', updateSleeperADP);
app.get('/sleeperADP/unique-values', getUniqueSleeperADPValues);

app.get('/teams/byeweek', async (req, res) => {
  const data = await getNFLTeamsByeWeek();
  res.json(data);
});

// 📋 Rutas modulares
app.use('/draft', draftRouter);
app.use('/projections', projectionsRouter);
app.use('/extras', extrasRouter);
app.use('/rankings', rankingsRouter);

// 🌐 Default
app.get('/', (req, res) => {
  res.send('✅ API Fantasy NFL en línea');
});

// 🚀 Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en: ${PORT}`);
});
