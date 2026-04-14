import { createRNG } from './rng.js';

export function kmeans(points, k, { maxIter = 50, seed = 42 } = {}) {
  const random = createRNG(seed);
  const n = points.length, dim = points[0].length;

  // K-means++ initialization — pick spread-out centers, not random ones
  const centroids = [];
  const firstIdx = Math.floor(random() * n);
  centroids.push([...points[firstIdx]]);

  for (let c = 1; c < k; c++) {
    const dists = new Float64Array(n);
    let totalDist = 0;
    for (let i = 0; i < n; i++) {
      let minD = Infinity;
      for (let j = 0; j < centroids.length; j++) {
        let d = 0;
        for (let f = 0; f < dim; f++) { const df = points[i][f] - centroids[j][f]; d += df * df; }
        if (d < minD) minD = d;
      }
      dists[i] = minD;
      totalDist += minD;
    }
    // Weighted random pick — farther points more likely to be chosen
    let target = random() * totalDist;
    for (let i = 0; i < n; i++) {
      target -= dists[i];
      if (target <= 0) { centroids.push([...points[i]]); break; }
    }
    if (centroids.length === c) centroids.push([...points[Math.floor(random() * n)]]);
  }

  const labels = new Int32Array(n);
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      let best = 0, bestD = Infinity;
      for (let c = 0; c < k; c++) {
        let d = 0;
        for (let j = 0; j < dim; j++) { const df = points[i][j] - centroids[c][j]; d += df * df; }
        if (d < bestD) { bestD = d; best = c; }
      }
      if (labels[i] !== best) { labels[i] = best; changed = true; }
    }
    if (!changed) break;
    const sums = Array.from({ length: k }, () => new Float64Array(dim));
    const counts = new Int32Array(k);
    for (let i = 0; i < n; i++) {
      counts[labels[i]]++;
      for (let j = 0; j < dim; j++) sums[labels[i]][j] += points[i][j];
    }
    for (let c = 0; c < k; c++) {
      if (!counts[c]) continue;
      for (let j = 0; j < dim; j++) centroids[c][j] = sums[c][j] / counts[c];
    }
  }
  return labels;
}

export function clusterize(embedding, { k, seed = 42 } = {}) {
  const autoK = k || Math.min(6, Math.max(3, Math.round(Math.sqrt(embedding.length / 10))));
  return { labels: kmeans(embedding, autoK, { seed }), k: autoK };
}
