import { createDB, insertOrUpdatePlayer } from './db.js';

import DataTable from 'https://cdn.datatables.net/2.3.2/js/dataTables.esm.min.js';

const API_URL = 'https://api.sleeper.app/v1/players/nfl';

async function fetchAndDisplayPlayers() {
  const response = await fetch(API_URL);
  const data = await response.json();

  const db = await createDB();

  const rows = [];

  for (const id in data) {
    const player = data[id];
    if (!player || !player.player_id) continue;

    const estado = player.injury_status ?? '';
    const playerData = [
      player.player_id,
      player.first_name + ' ' + player.last_name,
      player.position ?? '',
      player.team ?? '',
      player.status ?? '',
      estado,
      player.years_exp ?? 0,
    ];

    await insertOrUpdatePlayer(db, playerData);
    rows.push(playerData);
  }

  new DataTable('#playersTable', {
    data: rows,
    columns: [
      { title: 'ID' },
      { title: 'Nombre' },
      { title: 'Posición' },
      { title: 'Equipo' },
      { title: 'Estatus' },
      { title: 'Lesión' },
      { title: 'Años de Exp' }
    ],
  });
}

fetchAndDisplayPlayers();
