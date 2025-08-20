// routes/manualRoutes.js
import express from 'express';
import {
  upsertLeagueManual,
  getManualLeaguesForAuthUser,
  getLeaguesByUser,
  deleteLeagueById,
  setLeagueUser,
  upsertLeagueSettings,
  getLeagueSettings,
  deleteLeagueSettings,
  addDraftedPlayer,
  getDraftedPlayers,
  resetDraftedPlayers
} from './leagues.js';

const router = express.Router();

// Ligas manuales (UI)
router.post('/leagues/insert', upsertLeagueManual);              // crear/actualizar liga manual
router.get('/leagues', getManualLeaguesForAuthUser);            // obtener ligas del usuario autenticado
router.get('/leagues/user/:user_id', getLeaguesByUser);         // legacy/admin: obtener ligas por user_id
router.delete('/leagues/:id', deleteLeagueById);                // eliminar liga por id
router.patch('/leagues/:id/user', setLeagueUser);               // asignar/desasignar user_id

// League settings (config JSONB)
router.put('/league-settings/:league_id', upsertLeagueSettings); // guardar settings (PUT)
router.get('/league-settings/:league_id', getLeagueSettings);   // obtener settings
router.delete('/league-settings/:league_id', deleteLeagueSettings); // borrar

// Drafted players
router.post('/drafted', addDraftedPlayer);                      // agregar drafted player
router.get('/drafted/:league_id', getDraftedPlayers);           // obtener jugadores drafteados por liga
router.delete('/drafted/:league_id', resetDraftedPlayers);      // reset players for league

export default router;
