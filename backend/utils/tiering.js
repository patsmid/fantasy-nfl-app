const useClustering = true;
const minTierSize = 4; // solo para dropoff

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
  let clusters = new Array(k).fill().map(() => []);

  for (let iter = 0; iter < maxIterations; iter++) {
    clusters = new Array(k).fill().map(() => []);

    for (const value of values) {
      const distances = centroids.map(c => Math.abs(value - c));
      const clusterIndex = distances.indexOf(Math.min(...distances));
      clusters[clusterIndex].push(value);
    }

    const newCentroids = clusters.map(cluster =>
      cluster.length === 0 ? 0 : cluster.reduce((a, b) => a + b, 0) / cluster.length
    );

    if (centroids.every((c, i) => c === newCentroids[i])) break;
    centroids = newCentroids;
  }

  const assignments = new Map();
  clusters.forEach((cluster, clusterIndex) => {
    for (const value of cluster) {
      assignments.set(value, clusterIndex + 1); // tier 1 = mejor
    }
  });

  return assignments;
}

export function assignTiersByClustering(players, groupByPosition = false) {
  const grouped = groupByPosition
    ? groupBy(players, p => p.position)
    : { all: players };

  for (const group of Object.values(grouped)) {
    const k = Math.min(7, Math.floor(group.length / 4));
    const values = group.map(p => p.vor).filter(v => typeof v === 'number');
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
    let lastVOR = sorted[0]?.vor || 0;
    let count = 0;

    for (let i = 0; i < sorted.length; i++) {
      const player = sorted[i];
      const drop = Math.abs((player.dropoff ?? 0));
      count++;

      // cambio de tier si el drop es alto o acumulamos mínimo
      if (drop > 10 && count >= minTierSize) {
        tier++;
        count = 1;
      }

      player.tier = tier;
      lastVOR = player.vor;
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
