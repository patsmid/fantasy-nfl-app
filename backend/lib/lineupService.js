import { getSleeperLeague, getRosters } from '../utils/sleeper.js';
import { getConfigValue, getPlayersData, getPlayersByNames } from './draftUtils.js';
import { getRankings, getDSTRankings, getKickerRankings } from './rankingsService.js';
import { getStarterPositions, fuzzySearch } from '../utils/helpers.js';
import { generateLineup } from './lineupUtils.js';
import { getExpertData } from '../experts.js';

export async function getLineupData(
  leagueId,
  { idExpert = null, position = 'TODAS', week = 1 } = {}
) {
  // 1. Datos de la liga y configuración
  const leagueData = await getSleeperLeague(leagueId);
  const starterPositions = getStarterPositions(leagueData);
  const superFlex = starterPositions.includes('SUPER_FLEX');
  const scoring =
    leagueData.scoring_settings?.rec === 1
      ? 'PPR'
      : leagueData.scoring_settings?.rec === 0.5
      ? 'HALF'
      : 'STANDARD';

  const tipoLiga = await getConfigValue('dynasty');
  const dynasty = leagueData.settings.type === 2 && tipoLiga === 'LIGA';
  const finalPosition = superFlex && position === 'TODAS' ? 'SUPER FLEX' : position;

  const season = await getConfigValue('season');
  const mainUserId = await getConfigValue('main_user_id');

  // 2. Rankings y promesas relacionadas
  const expertData = await getExpertData(idExpert);

  const rankingsPromise = getRankings({
    season,
    dynasty,
    scoring,
    expertData,
    position: finalPosition,
    week
  });

  const rankingsResponse = await rankingsPromise;
  const rankings = Array.isArray(rankingsResponse?.players)
    ? rankingsResponse.players
    : [];
  const ranks_published = rankingsResponse?.published ?? null;
  const source = rankingsResponse?.source ?? null;

  // DST & K con offsets (solo si el experto es fantasypros)
  let dstRankings = [];
  let kickerRankings = [];

  if (expertData?.source === 'fantasypros') {
    if (starterPositions.includes('DEF')) {
      dstRankings =
        (await getDSTRankings({
          season,
          dynasty,
          expertData,
          week
        }))?.players?.map(p => ({
          ...p,
          rank: (Number(p.rank) || 9999) + 10000,
        })) || [];
    }
    if (starterPositions.includes('K')) {
      kickerRankings =
        (await getKickerRankings({
          season,
          dynasty,
          expertData,
          week
        }))?.players?.map(p => ({
          ...p,
          rank: (Number(p.rank) || 9999) + 20000,
        })) || [];
    }
  }

  // 3. Roster del usuario
  const allRosters = await getRosters(leagueId);
  const myRoster = allRosters.find(r => r.owner_id === mainUserId);
  const playerIds = myRoster?.players ?? [];

  if (!playerIds || playerIds.length === 0) {
    throw new Error('Roster vacío o sin jugadores.');
  }

  // 4. Info de jugadores
  const playersData = await getPlayersData(playerIds);
	// console.log(playersData);
  // 5. Construir arreglo de jugadores con ranking asignado
  const players = playerIds
    .map(sleeperId => {
      const info = playersData.find(p => p.player_id === String(sleeperId));
      if (!info) return null;

      const name = info.full_name;
      const isDST = info.position === 'DEF';
      const isK = info.position === 'K';
      const rankingList = isDST
        ? dstRankings
        : isK
        ? kickerRankings
        : rankings;
      const ranked = fuzzySearch(name, rankingList);

      const playerRank = ranked[0] || {};
      const rank =
        ranked.length === 0 || info.injury_status === 'Out'
          ? 9999
          : playerRank.rank;
      const matchup = playerRank.matchup || 'N/D';
      const byeWeek = playerRank.bye_week || info.bye_week || 'N/D';
      const rookie = info.years_exp === 0 ? ' (R)' : '';

      return {
        rank,
        nombre: `${getDisplayName(info)}${rookie}`,
        position: info.position,
        team: info.team,
        matchup,
        byeWeek,
        injuryStatus: info.injury_status || '',
        sleeperId
      };
    })
    .filter(Boolean);

  // 6. Ordenar por ranking
  players.sort((a, b) => a.rank - b.rank);

  // 7. Generar titulares y banca
  const [starters, bench] = generateLineup(players, starterPositions);

  return {
    success: true,
    meta: {
      scoring,
      dynasty,
      superFlex,
      published: ranks_published,
      source
    },
    starters,
    bench
  };
}

/**
 * Genera el listado de agentes libres (waivers) para una liga de Sleeper,
 * ordenados por ranking del experto seleccionado. Sigue la misma lógica y
 * dependencias que getLineupData, para ser consistente con tu stack actual.
 *
 * Campos devueltos por cada jugador:
 *  - rank: número de ranking (DST/K con offset si aplica)
 *  - nombre: "Full Name (R)" si es novato
 *  - position: posición (QB/RB/WR/TE/K/DEF)
 *  - team: equipo (por ej. KC)
 *  - matchup: abreviatura del enfrentamiento (si el origen lo provee)
 *  - byeWeek: semana de descanso
 *  - injuryStatus: estado de lesión ("Out", "Questionable", etc)
 *  - sleeperId: id de Sleeper si se pudo resolver
 */
 export async function getFreeAgentsData(
   leagueId,
   { idExpert = null, position = 'TODAS', week = 1 } = {}
 ) {
   // 1) Liga y configuración
   const leagueData = await getSleeperLeague(leagueId);
   const starterPositions = getStarterPositions(leagueData);
   const superFlex = starterPositions.includes('SUPER_FLEX');

   const scoring =
     leagueData.scoring_settings?.rec === 1
       ? 'PPR'
       : leagueData.scoring_settings?.rec === 0.5
       ? 'HALF'
       : 'STANDARD';

   const tipoLiga = await getConfigValue('dynasty');
   const dynasty = leagueData.settings.type === 2 && tipoLiga === 'LIGA';
   const season = await getConfigValue('season');

   const finalPosition = superFlex && position === 'TODAS' ? 'SUPER FLEX' : position;

   console.log('▶ starterPositions:', starterPositions);
   console.log('▶ Config:', { scoring, dynasty, superFlex, finalPosition, season });

   // 2) Experto y rankings
   const expertData = await getExpertData(idExpert);

   const rankingsResponse = await getRankings({
     season,
     dynasty,
     scoring,
     expertData,
     position: finalPosition,
     week
   });

   const rankings = Array.isArray(rankingsResponse?.players) ? rankingsResponse.players : [];
   const ranks_published = rankingsResponse?.published ?? null;
   const source = rankingsResponse?.source ?? null;

   // DST & K con offsets (solo si FP + si la liga usa esas posiciones)
   let dstRankings = [];
   let kickerRankings = [];

   if (expertData?.source === 'fantasypros') {
     if (starterPositions.includes('DEF')) {
       dstRankings =
         (await getDSTRankings({ season, dynasty, expertData, week }))?.players?.map(p => ({
           ...p,
           rank: (Number(p.rank) || 9999) + 10000,
           player_name: p.player_name,
           player_team_id: p.player_team_id,
           player_positions: p.player_positions,
           matchup: p.matchup,
           bye_week: p.bye_week
         })) || [];
     }
     if (starterPositions.includes('K')) {
       kickerRankings =
         (await getKickerRankings({ season, dynasty, expertData, week }))?.players?.map(p => ({
           ...p,
           rank: (Number(p.rank) || 9999) + 20000,
           player_name: p.player_name,
           player_team_id: p.player_team_id,
           player_positions: p.player_positions,
           matchup: p.matchup,
           bye_week: p.bye_week
         })) || [];
     }
   }

   // 3) Jugadores ocupados en la liga
   const allRosters = await getRosters(leagueId);
   const ownedSet = new Set();
   for (const r of allRosters || []) {
     if (Array.isArray(r?.players)) {
       for (const pid of r.players) ownedSet.add(String(pid));
     }
   }

   // 4) Traer base de jugadores (con chunks)
   const allPlayers = await getPlayersData();

   // 5) Construir FA
   const byIdBest = new Map();
   for (const info of allPlayers) {

     const sleeperId = String(info.player_id || '');
     const pos = String((info.position || '')).toUpperCase();

     if (!sleeperId || ownedSet.has(sleeperId)) continue;
     if (!isAllowedPosition(pos, starterPositions, superFlex)) continue;

     // Búsquedas
     const mainRanked = rankings.length ? fuzzySearch(getDisplayName(info), rankings) : [];

     // DST: usar directamente el campo team
     let dstRanked = [];
     if (pos === 'DEF' && dstRankings.length) {
       dstRanked = dstRankings.filter(p => p.player_team_id === info.team);
     }

     // K: por fuzzySearch
     const kRanked = kickerRankings.length ? fuzzySearch(getDisplayName(info), kickerRankings) : [];

     // Selección
     let chosenTop = null;
     if (mainRanked.length > 0) {
       const top = mainRanked[0];
       if (!top.player_positions || String(top.player_positions).toUpperCase() === pos) {
         if (!top.player_name || namesLikelySame(getDisplayName(info), top.player_name)) {
           chosenTop = top;
         }
       }
     }
     if (!chosenTop && dstRanked.length > 0) chosenTop = dstRanked[0];
     if (!chosenTop && kRanked.length > 0) chosenTop = kRanked[0];
     if (!chosenTop) continue;

     const top = chosenTop;
     const rankVal = typeof top.rank === 'number' ? top.rank : Number(top.rank);
     if (!Number.isFinite(rankVal)) continue;

     const rookie = info.years_exp === 0 ? ' (R)' : '';

     const candidate = {
       rank: rankVal,
       nombre: `${getDisplayName(info)}${rookie}`,
       position: pos,
       team: info.team || top.player_team_id || 'FA',
       matchup: top.matchup || 'N/D',
       byeWeek: top.bye_week || info.bye_week || 'N/D',
       injuryStatus: info.injury_status || '',
       sleeperId
     };

			const { usageScore } = estimateUsageSignals(candidate);
			const { next3, playoffs } = estimateScheduleScore(candidate.team);

			// Heurísticas rápidas para etiquetar
			const roleTag =
			  candidate.position === 'RB' ? (candidate.rank < 36 ? 'workhorse' : 'committee') :
			  candidate.position === 'WR' ? (candidate.rank < 48 ? 'starter' : 'stash') :
			  (candidate.position === 'TE' ? (candidate.rank < 12 ? 'starter' : 'streamer') :
			  (candidate.position === 'QB' ? 'streamer' : 'stash'));

			const superFlexQB = meta?.superFlex && candidate.position === 'QB';
			const isContingentStud = roleTag === 'workhorse' || (candidate.position === 'RB' && candidate.rank < 48);

			const tier = classifyTier(candidate, usageScore);
			const [faabMin, faabMax] = faabRangeByTier(tier);

			const leagueWinnerScore = computeLeagueWinnerScore({
			  usageScore,
			  scheduleNext3: next3,
			  playoffScore: playoffs,
			  isContingentStud,
			  superFlexQB
			});

			// Riesgo simple: mayor rank => menor riesgo
			const riskLevel = leagueWinnerScore >= 75 ? 'low' : (leagueWinnerScore >= 55 ? 'med' : 'high');

			// ¿Es alineable ya? (ajústalo con tu proyección semanal cuando la tengas)
			const startableNow = (tier === 'A' || tier === 'B') && (candidate.injuryStatus !== 'Out');

			const bidReason = [
			  tier === 'A' ? 'Rol multi-semana / potencial rompeligas' :
			  tier === 'B' ? 'Uso en ascenso; upside real' :
			  tier === 'C' ? 'Streamer con opción de quedarse' : 'Stash/Lottery',
			  superFlexQB ? ' (SF boost QB)' : ''
			].join('');

			Object.assign(candidate, {
			  tier,
			  faabMin, faabMax,
			  bidReason,
			  startableNow,
			  roleTag,
			  scheduleScoreNext3: next3,
			  playoffScore: playoffs,
			  contingencyTo: null, // si conectas depth charts, rellénalo
			  riskLevel,
			  breakoutIndex: Math.round(usageScore * 100),
			  leagueWinnerScore,
			  blockRival: false // si detectas que cubre necesidad crítica de tu rival
			});


     const prev = byIdBest.get(sleeperId);
     if (!prev || candidate.rank < prev.rank) byIdBest.set(sleeperId, candidate);
   }

   const freeAgents = Array.from(byIdBest.values()).sort((a, b) => a.rank - b.rank);
   console.log('▶ freeAgents final count:', freeAgents.length);

   return {
     success: true,
     meta: { scoring, dynasty, superFlex, published: ranks_published, source },
     freeAgents
   };
 }

 /** Solo posiciones alineables */
 function isAllowedPosition(pos, starterPositions, superFlex) {
   const P = String(pos || '').toUpperCase();
   const IDP = new Set(['DL', 'DE', 'DT', 'LB', 'MLB', 'OLB', 'CB', 'DB', 'S', 'FS', 'SS', 'IDP']);
   if (IDP.has(P)) return false;

   const slots = new Set(starterPositions.map(s => String(s).toUpperCase()));
   if (slots.has(P)) return true;

   if (slots.has('FLEX') && (P === 'RB' || P === 'WR' || P === 'TE')) return true;
   if (superFlex && (P === 'QB' || P === 'RB' || P === 'WR' || P === 'TE')) return true;

   return false;
 }

 function getDisplayName(info) {
   if (info.full_name) return info.full_name;
   const first = info.first_name || '';
   const last = info.last_name || '';
   return `${first} ${last}`.trim();
 }

 /** Comparación de nombres (solo ofensivos) */
 function namesLikelySame(a, b) {
   const na = normalizeName(a);
   const nb = normalizeName(b);
   if (!na || !nb) return false;
   const [af, ...ar] = na.split(' ');
   const [bf, ...br] = nb.split(' ');

   const alast = ar.length ? ar[ar.length - 1] : af;
   const blast = br.length ? br[br.length - 1] : bf;

   if (alast !== blast) return false;
   if (af === bf) return true;
   if (af[0] && bf[0] && af[0] === bf[0]) return true;
   if (na.includes(nb) || nb.includes(na)) return true;

   return false;
 }

 function normalizeName(s) {
   return String(s || '')
     .toLowerCase()
     .replace(/\./g, ' ')
     .replace(/['’]/g, '')
     .replace(/-/g, ' ')
     .replace(/\bjr\b|\bsr\b|\bii\b|\biii\b|\biv\b/g, '')
     .replace(/\s+/g, ' ')
     .trim();
 }

 // Helpers “pluggable” (puedes moverlos a helpers.js)
 function norm01(x, min, max) { if (max === min) return 0; return Math.max(0, Math.min(1, (x - min) / (max - min))); }

 // Placeholder: si luego integras usage real, inyecta aquí.
 function estimateUsageSignals(p) {
   // Señales por posición basadas en ranking y posición
   const base = 1 - norm01(p.rank, 1, 300); // mejor rank => mayor base
   const posBoost = (p.position === 'RB' ? 0.15 : p.position === 'WR' ? 0.10 : p.position === 'TE' ? 0.05 : p.position === 'QB' ? 0.20 : 0);
   // SuperFlex: QB vale más (ya lo detectas en meta.superFlex)
   return { usageScore: Math.max(0, Math.min(1, base + posBoost)) };
 }

 // Placeholder de calendario (sustituye con tu SOS real)
 function estimateScheduleScore(team) {
   // Sin datos: neutral = 50 (puedes enchufar SOS by weeks 1–3 & 15–17)
   return { next3: 50, playoffs: 50 };
 }

 function classifyTier(p, usageScore) {
   // A: rol probable multi-semana / upside claro; D: stash puro/streamer
   if (p.position === 'QB' && usageScore > 0.75) return 'A';
   if (usageScore > 0.8) return 'A';
   if (usageScore > 0.6) return 'B';
   if (usageScore > 0.4) return 'C';
   return 'D';
 }

 function faabRangeByTier(tier) {
   switch (tier) {
     case 'A': return [35, 60];
     case 'B': return [18, 35];
     case 'C': return [8, 15];
     default:  return [0, 7];
   }
 }

 // Combina señales en un índice 0–100
 function computeLeagueWinnerScore({ usageScore, scheduleNext3, playoffScore, isContingentStud, superFlexQB }) {
   const wUsage = 0.55, wNext3 = 0.15, wPlayoffs = 0.20, wCont = 0.10;
   let s = (usageScore * wUsage)
         + (scheduleNext3/100 * wNext3)
         + (playoffScore/100 * wPlayoffs)
         + ((isContingentStud ? 1 : 0) * wCont);
   if (superFlexQB) s += 0.05; // pequeño bonus en SF
   return Math.round(Math.max(0, Math.min(1, s)) * 100);
 }
