export function createDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('FantasyNFLDB', 1);
    request.onupgradeneeded = function (event) {
      const db = event.target.result;
      const store = db.createObjectStore('players', { keyPath: 'player_id' });
    };
    request.onsuccess = function (event) {
      resolve(event.target.result);
    };
    request.onerror = function (event) {
      reject(event.target.error);
    };
  });
}

export function insertOrUpdatePlayer(db, playerData) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['players'], 'readwrite');
    const store = tx.objectStore('players');
    const [player_id, full_name, position, team, status, injury_status, years_exp] = playerData;
    store.put({
      player_id,
      full_name,
      position,
      team,
      status,
      injury_status,
      years_exp
    });
    tx.oncomplete = () => resolve();
    tx.onerror = (event) => reject(event.target.error);
  });
}
