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
import {
  getNFLTeamsByeWeek,
  getTeamsFromSupabase,
  upsertTeams,
  updateTeamById,
  bulkUpdatePlayersByeWeeks
} from './lib/teamsService.js';
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
		const updateResult = await bulkUpdatePlayersByeWeeks();
		if (!updateResult.success) {
			return res.status(500).json({ error: updateResult.error.message });
		}
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

app.get('/teams', async (req, res) => {
  try {
    const data = await getTeamsFromSupabase();
    res.json(data);
  } catch (err) {
    console.error('Error al obtener equipos:', err.message);
    res.status(500).json({ error: 'Error al obtener equipos desde Supabase' });
  }
});

app.post('/teams/save', async (req, res) => {
  try {
    const result = await saveTeamsFromESPN();
    res.json({
      message: result.message,
      teamsCount: result.data.length
    });
  } catch (err) {
    console.error('❌ Error en /teams/save:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.put('/teams/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const updated = await updateTeamById(id, req.body);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
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
