// ===============================
// CONFIGURACIÓN
// ===============================
const minTierSize = 4; // solo para Dropoff
const defaultMaxClusters = 7; // máximo de tiers posibles
const tierLabels = [
  '🔥 Elite',
  '💎 Top',
  '⭐ Starter',
  '✅ Confiable',
  '🔄 Relleno',
  '📦 Profundidad',
  '⚠️ Riesgo',
  '🪑 Bench'
];

// ===============================
// ASIGNACIÓN PRINCIPAL DE TIERS
// ===============================
export function assignTiers(players, groupByPosition = false) {
  if (!Array.isArray(players) || players.length === 0) return players;

  const hasHybridData = players.some(
    p => typeof p.adjustedVOR === 'number' && typeof p.dropoff === 'number'
  );

  if (hasHybridData) {
    assignTiersHybrid(players, groupByPosition);
  } else {
    const enoughDataForClustering = players.some(p => typeof p.vor === 'number');
    enoughDataForClustering
      ? assignTiersByClustering(players, groupByPosition)
      : assignTiersByDropoff(players, groupByPosition);
  }

  // Asignación automática de labels
  const tiers = players.map(p => p.tier);
  const maxTier = Math.max(...tiers);
  for (const p of players) {
    p.tier_label = getTierLabel(p.tier, maxTier);
  }

  return players;
}

function getTierLabel(tier, totalTiers = 5) {
  const available = tierLabels.slice(0, totalTiers).concat(
    Array(Math.max(0, totalTiers - tierLabels.length)).fill(tierLabels[tierLabels.length - 1])
  );
  return available[Math.min(tier - 1, available.length - 1)];
}

// ===============================
// VERSIÓN HÍBRIDA (adjustedVOR + dropoff) DINÁMICA
// ===============================
export function assignTiersHybrid(players, groupByPosition = false) {
  const grouped = groupByPosition
    ? groupBy(players, p => p.position)
    : { all: players };

  for (const group of Object.values(grouped)) {
    const dataset = group.map(p => [
      Number(p.adjustedVOR || 0),
      Number(p.dropoff || 0)
    ]);

    const vorValues = dataset.map(d => d[0]);
    const vorRange = Math.max(...vorValues) - Math.min(...vorValues);
    let k = Math.min(defaultMaxClusters, Math.ceil(group.length / 5));
    if (vorRange < 20) k = Math.max(2, Math.floor(k / 2));
    if (vorRange > 100) k = Math.min(defaultMaxClusters, k + 1);

    const labels = kmeansSimple(dataset, k);

    const avgByCluster = {};
    labels.forEach((cluster, i) => {
      if (!avgByCluster[cluster]) avgByCluster[cluster] = [];
      avgByCluster[cluster].push(dataset[i][0]);
    });

    const clusterOrder = Object.keys(avgByCluster)
      .sort((a, b) => average(avgByCluster[b]) - average(avgByCluster[a]));

    const clusterRankMap = {};
    clusterOrder.forEach((c, i) => (clusterRankMap[c] = i + 1));

    group.forEach((p, i) => {
      p.tier = clusterRankMap[labels[i]];
    });
  }

  return players;
}

// ===============================
// VERSIÓN K-MEANS CLUSTERING (1D)
// ===============================
export function assignTiersByClustering(players, groupByPosition = false) {
  const grouped = groupByPosition
    ? groupBy(players, p => p.position)
    : { all: players };

  for (const group of Object.values(grouped)) {
    const values = group
      .map(p => p.vor)
      .filter(v => typeof v === 'number');

    const k = Math.min(defaultMaxClusters, Math.max(2, Math.floor(values.length / 4)));
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
// MÉTODOS AUXILIARES
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
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

// --- KMeans multidimensional para assignTiersHybrid ---
function kmeansSimple(data, k = 3, maxIter = 100) {
  const centroids = data.slice(0, k).map(v => [...v]);
  let labels = new Array(data.length).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    labels = data.map(point =>
      centroids
        .map(c => euclidean(point, c))
        .reduce((bestIdx, dist, idx, arr) =>
          dist < arr[bestIdx] ? idx : bestIdx, 0)
    );

    const newCentroids = Array.from({ length: k }, () => []);
    data.forEach((point, idx) => {
      newCentroids[labels[idx]].push(point);
    });

    for (let i = 0; i < k; i++) {
      if (newCentroids[i].length) {
        centroids[i] = averagePoint(newCentroids[i]);
      }
    }
  }
  return labels;
}

function euclidean(a, b) {
  return Math.sqrt(a.reduce((sum, val, i) => sum + (val - b[i]) ** 2, 0));
}

function averagePoint(points) {
  const dims = points[0].length;
  const avg = new Array(dims).fill(0);
  points.forEach(p => {
    for (let i = 0; i < dims; i++) avg[i] += p[i];
  });
  for (let i = 0; i < dims; i++) avg[i] /= points.length;
  return avg;
}

// --- KMeans 1D para assignTiersByClustering ---
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
      assignments.set(value, i + 1);
    }
  });

  return assignments;
}
