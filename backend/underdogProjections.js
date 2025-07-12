import fetch from 'node-fetch';
import { supabase } from './supabaseClient.js';

/**
 * Normaliza texto para comparación sencilla
 */
function normalizeText(text) {
  return text?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
}

/**
 * Función para obtener jugadores paginados y filtrados de Supabase
 */
async function getSleeperPlayers(req) {
  const start = parseInt(req.query.start) || 0;
  const length = parseInt(req.query.length) || 9000; // aumenta límite para mejor matching
  const from = start;
  const to = start + length - 1;

  const columns = [
    'id',
    'player_id',
    'first_name',
    'last_name',
    'full_name',
    'position',
    'team',
    'status',
    'injury_status',
    'years_exp'
  ];

  let query = supabase.from('players').select('*', { count: 'exact' });

  // Aplicar filtros si existen
  columns.forEach((col, index) => {
    const value = req.query[`filter_col_${index}`];
    if (value && value.trim() !== '') {
      query = query.ilike(col, `%${value}%`);
    }
  });

  // Ordenar por id descendente
  query = query.order('id', { ascending: false });

  // Aplicar rango de paginación
  query = query.range(from, to);

  const { data, count, error } = await query;

  if (error) throw error;

  return data || [];
}

/**
 * Consulta Underdog API y procesa proyecciones
 */
export async function fetchAndProcessUnderdogProjections(req, res) {
  try {
    // 1) Obtener jugadores desde Supabase con paginación y filtros
    const sleeperPlayers = await getSleeperPlayers(req);

    // 2) Llamar API Underdog
    const url = 'https://api.underdogfantasy.com/beta/over_under_lines';
    const response = await fetch(url);

    if (!response.ok) {
      res.status(500).json({ error: `Underdog API error: ${response.status}` });
      return;
    }

    const data = await response.json();

    // 3) Mapear y agregar proyecciones haciendo match con jugadores Sleeper
    const projMap = new Map();

    for (const line of data) {
      const playerName = line.over_under_pick_entry?.player_name;
      const team = line.over_under_pick_entry?.team;
      const stat = line.stat_type;
      const value = parseFloat(line.over_under);

      if (!playerName || !team || !stat || isNaN(value)) continue;

      const normalizedPlayer = normalizeText(playerName);
      const normalizedTeam = normalizeText(team);

      // Match en Sleeper: full_name + team normalizados
      const sleeperMatch = sleeperPlayers.find(
        (p) =>
          normalizeText(p.full_name) === normalizedPlayer &&
          normalizeText(p.team) === normalizedTeam
      );

      if (!sleeperMatch) continue;

      const key = sleeperMatch.player_id;
      if (!projMap.has(key)) {
        projMap.set(key, {
          sleeper_player_id: key,
          player_name: playerName,
          team,
          stats: {},
        });
      }

      projMap.get(key).stats[stat] = value;
    }

    // 4) Calcular proyecciones de puntos fantasy básicas PPR
    const projections = [];

    for (const [, proj] of projMap.entries()) {
      const s = proj.stats;
      const projected_points =
        (s.rushing_yards || 0) * 0.1 +
        (s.rushing_tds || 0) * 6 +
        (s.receiving_yards || 0) * 0.1 +
        (s.receptions || 0) * 1 +
        (s.receiving_tds || 0) * 6 +
        (s.passing_yards || 0) * 0.04 +
        (s.passing_tds || 0) * 4 -
        (s.interceptions || 0) * 2;

      projections.push({
        sleeper_player_id: proj.sleeper_player_id,
        player_name: proj.player_name,
        team: proj.team,
        projected_points: parseFloat(projected_points.toFixed(2)),
        stats: proj.stats,
      });
    }

    res.json({ success: true, projections });
  } catch (error) {
    console.error('❌ Error en fetchAndProcessUnderdogProjections:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}
