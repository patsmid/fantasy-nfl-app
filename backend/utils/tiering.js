// ===============================
// CONFIGURACIÓN
// ===============================
const useClustering = false;
const minTierSize = 4; // solo para Dropoff

// ===============================
// ASIGNACIÓN PRINCIPAL DE TIERS
// ===============================
export function assignTiers(players, groupByPosition = false) {
  return useClustering
    ? assignTiersByClustering(players, groupByPosition)
    : assignTiersByDropoff(players, groupByPosition);
}

// ===============================
// VERSIÓN K-MEANS CLUSTERING
// ===============================
function kMeans(values, k) {
  const maxIterations = 100;
  let centroids = values.slice(0, k);
  let clusters = Array.from({ length: k }, () => []);

  for (let iter = 0; iter < maxIterations; iter++) {
    clusters = Array.from({ length: k }, () => []);

    for (const value of values) {
      const distances = centroids.map(c => Math.abs(value - c));
      const closest = distances.indexOf(Math.min(...distances));
      clusters[closest].push(value);
    }

    const newCentroids = clusters.map(cluster =>
      cluster.length === 0 ? 0 : average(cluster)
    );

    if (centroids.every((c, i) => c === newCentroids[i])) break;
    centroids = newCentroids;
  }

  const assignments = new Map();
  clusters.forEach((cluster, i) => {
    for (const value of cluster) {
      assignments.set(value, i + 1); // Tier 1 = mejor
    }
  });

  return assignments;
}

export function assignTiersByClustering(players, groupByPosition = false) {
  const grouped = groupByPosition
    ? groupBy(players, p => p.position)
    : { all: players };

  for (const group of Object.values(grouped)) {
    const values = group
      .map(p => p.vor)
      .filter(v => typeof v === 'number');

    const k = Math.max(2, Math.min(7, Math.floor(values.length / 4)));

    const assignments = kMeans(values, k);

    for (const player of group) {
      player.tier = assignments.get(player.vor) || k;
    }
  }

  return players;
}

// ===============================
// VERSIÓN BASADA EN DROPOFF
// ===============================
export function assignTiersByDropoff(players, groupByPosition = false) {
  const grouped = groupByPosition
    ? groupBy(players, p => p.position)
    : { all: players };

  for (const group of Object.values(grouped)) {
    const sorted = group
      .filter(p => typeof p.vor === 'number')
      .sort((a, b) => b.vor - a.vor);

    let tier = 1;
    let count = 0;

    for (let i = 0; i < sorted.length; i++) {
      const player = sorted[i];
      const drop = Math.abs(player.dropoff ?? 0);
      count++;

      if (drop > 10 && count >= minTierSize) {
        tier++;
        count = 1;
      }

      player.tier = tier;
    }
  }

  return players;
}

// ===============================
// UTILIDADES
// ===============================
function groupBy(arr, keyFn) {
  return arr.reduce((acc, item) => {
    const key = keyFn(item);
    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {});
}

function average(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
