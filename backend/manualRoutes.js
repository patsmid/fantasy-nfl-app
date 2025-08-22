// routes/manualRoutes.js
import express from 'express';
import {
  // Ligas
  upsertLeagueManual,
  getManualLeaguesForAuthUser,
  getLeaguesByUser,
  deleteLeagueById,
  setLeagueUser,
  // Settings
  upsertLeagueSettings,
  getLeagueSettings,
  deleteLeagueSettings,
  // Drafted players
  addDraftedPlayer,
  getDraftedPlayers,
  resetDraftedPlayers
} from './leagues.js';

import { getDraftDataManual } from './draftService.js';
import { isValidPosition } from './utils/helpers.js';

const router = express.Router();

/* ============================
   📌 Ligas Manuales
   ============================ */
router.post('/leagues', upsertLeagueManual);              // crear/actualizar liga
router.get('/leagues', getManualLeaguesForAuthUser);      // obtener ligas del usuario autenticado
router.get('/leagues/user/:user_id', getLeaguesByUser);   // admin: ligas por user_id
router.delete('/leagues/:league_id', deleteLeagueById);   // eliminar liga
router.patch('/leagues/:league_id/user', setLeagueUser);  // asignar/desasignar user_id

/* ============================
   ⚙️ Configuración de Liga (Rutas canónicas)
   ============================ */
/* Ruta canónica (ya existente en tu proyecto) */
router.put('/leagues/:league_id/settings', upsertLeagueSettings);   // guardar/actualizar settings
router.get('/leagues/:league_id/settings', getLeagueSettings);      // obtener settings
router.delete('/leagues/:league_id/settings', deleteLeagueSettings);// borrar settings

/* ============================
   ⚙️ Configuración de Liga (ALIAS - compatibilidad hacia atrás)
   ============================ */
/* Estas rutas responden a /manual/league-settings/:league_id  - las dejó por compatibilidad
   con clientes antiguos que usaban ese path. Puedes quitar estos alias cuando actualices frontend. */
router.put('/league-settings/:league_id', upsertLeagueSettings);
router.get('/league-settings/:league_id', getLeagueSettings);
router.delete('/league-settings/:league_id', deleteLeagueSettings);

/* ============================
   🏈 Jugadores Drafteados
   ============================ */
router.post('/leagues/:league_id/drafted', addDraftedPlayer);       // agregar jugador
router.get('/leagues/:league_id/drafted', getDraftedPlayers);       // obtener todos
router.delete('/leagues/:league_id/drafted', resetDraftedPlayers);  // resetear jugadores

/* ============================
   📊 Draft Manual
   ============================ */
router.get('/draft/:league_id', async (req, res) => {
  try {
    const { league_id } = req.params;
    let { position = 'TODAS', byeCondition = 0, idExpert = '3701' } = req.query;

    // Permitir booleano 'true' como string en position
    if (position === 'true') position = true;

    // Validar posición (si no es SUPER FLEX ni true)
    if (!isValidPosition(position) && position !== true && position !== 'SUPER FLEX') {
      return res.status(400).json({ error: `Parámetro 'position' inválido: '${position}'` });
    }

    const byeCondParsed = isNaN(Number(byeCondition)) ? 0 : Number(byeCondition);

    const data = await getDraftDataManual(league_id, {
      position,
      byeCondition: byeCondParsed,
      idExpert
    });

    res.json(data);
  } catch (error) {
    console.error('❌ Error en /manual/leagues/:league_id/draft', error);
    res.status(500).json({ error: error.message || 'Error interno del servidor' });
  }
});

export default router;
