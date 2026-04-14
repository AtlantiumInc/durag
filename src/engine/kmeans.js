export function kmeans(points, k, maxIter = 50) {
  const n = points.length, dim = points[0].length;
  const used = new Set(), centroids = [];
  while (centroids.length < k) {
    const i = Math.floor(Math.random() * n);
    if (!used.has(i)) { used.add(i); centroids.push([...points[i]]); }
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

export function clusterize(embedding, { k } = {}) {
  const autoK = k || Math.min(6, Math.max(3, Math.round(Math.sqrt(embedding.length / 10))));
  return { labels: kmeans(embedding, autoK), k: autoK };
}
