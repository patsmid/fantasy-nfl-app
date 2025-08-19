import express from 'express';
import {
  upsertLeagueManual,
  getLeaguesByUser,
  deleteLeagueById,
  setLeagueUser,
  getLeaguesFromDB,
  getLeagueById,
  updateLeagueDynasty,
  updateLeagues,
  getLeagues
} from './leagues.js';

const router = express.Router();

// ✅ Nuevas rutas manuales
router.post('/leagues/insert', upsertLeagueManual);              // crear/actualizar liga manual
router.get('/leagues/user/:user_id', getLeaguesByUser);          // obtener ligas por usuario
router.delete('/leagues/:id', deleteLeagueById);                 // eliminar liga por id
router.patch('/leagues/:id/user', setLeagueUser);                // asignar/desasignar user_id

// ✅ Rutas existentes que ya tenías (no usar por ahora)
// router.get('/', getLeaguesFromDB);                       // ligas desde BD
// router.get('/sleeper', getLeagues);                      // ligas desde API Sleeper
// router.get('/:id', getLeagueById);                       // obtener liga por id
// router.patch('/:id/dynasty', updateLeagueDynasty);       // actualizar campo dynasty
// router.post('/update', updateLeagues);                   // refrescar ligas desde Sleeper

export default router;
