import { createRNG } from './rng.js';

export class UMAP {
  constructor({ nComponents = 2, nNeighbors = 15, minDist = 0.1, nEpochs = 200, seed = 42 } = {}) {
    this.nComponents = nComponents;
    this.nNeighbors = nNeighbors;
    this.minDist = minDist;
    this.nEpochs = nEpochs;
    this.random = createRNG(seed);
    const md = minDist;
    if (md <= 0.001) { this._a = 1; this._b = 1; }
    else { this._b = 0.7 + 0.2 * md; this._a = 1 / (Math.pow(md, 2 * this._b) + 0.001); }
  }

  _dist(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
    return Math.sqrt(s);
  }

  _buildKNN(data) {
    const n = data.length, k = Math.min(this.nNeighbors, n - 1);
    const indices = [], distances = [];
    for (let i = 0; i < n; i++) {
      const d = [];
      for (let j = 0; j < n; j++) if (i !== j) d.push({ idx: j, dist: this._dist(data[i], data[j]) });
      d.sort((a, b) => a.dist - b.dist);
      indices[i] = d.slice(0, k).map(x => x.idx);
      distances[i] = d.slice(0, k).map(x => x.dist);
    }
    return { indices, distances };
  }

  _buildGraph(indices, distances) {
    const n = indices.length, graph = new Map(), target = Math.log2(this.nNeighbors);
    for (let i = 0; i < n; i++) {
      const dists = distances[i], rho = dists[0] || 0;
      let lo = 0, hi = 1000, sigma = 1;
      for (let it = 0; it < 64; it++) {
        sigma = (lo + hi) / 2;
        let sum = 0;
        for (let j = 0; j < dists.length; j++) sum += Math.exp(-Math.max(0, dists[j] - rho) / sigma);
        if (Math.abs(sum - target) < 1e-5) break;
        if (sum > target) hi = sigma; else lo = sigma;
      }
      for (let k = 0; k < indices[i].length; k++) {
        const j = indices[i][k];
        const w = Math.exp(-Math.max(0, dists[k] - rho) / (sigma || 1));
        const key = i < j ? `${i},${j}` : `${j},${i}`;
        const prev = graph.get(key) || { i: Math.min(i, j), j: Math.max(i, j), w: 0 };
        prev.w = prev.w + w - prev.w * w;
        graph.set(key, prev);
      }
    }
    return [...graph.values()];
  }

  async fitAsync(data, cb) {
    const n = data.length;
    const { indices, distances } = this._buildKNN(data);
    const edges = this._buildGraph(indices, distances);

    // Graph-aware initialization
    const emb = [];
    for (let i = 0; i < n; i++) {
      emb[i] = new Float64Array(this.nComponents);
      for (let d = 0; d < this.nComponents; d++) emb[i][d] = (this.random() - 0.5) * 20;
    }
    for (let p = 0; p < 5; p++) {
      for (let i = 0; i < n; i++) {
        for (let d = 0; d < this.nComponents; d++) {
          let s = emb[i][d];
          const nb = indices[i];
          for (let k = 0; k < nb.length; k++) s += emb[nb[k]][d];
          emb[i][d] = s / (nb.length + 1);
        }
      }
    }

    const maxW = Math.max(...edges.map(e => e.w));
    const epPer = edges.map(e => e.w <= 0 ? this.nEpochs + 1 : Math.round(this.nEpochs * (1 - e.w / maxW)));
    const dim = this.nComponents;
    const clip = v => Math.max(-4, Math.min(4, v));

    for (let ep = 0; ep < this.nEpochs; ep++) {
      const alpha = 1 - ep / this.nEpochs;
      for (let e = 0; e < edges.length; e++) {
        if (epPer[e] > ep) continue;
        const { i, j } = edges[e];
        let dSq = 0;
        for (let d = 0; d < dim; d++) { const df = emb[i][d] - emb[j][d]; dSq += df * df; }
        const dist = Math.sqrt(Math.max(dSq, 1e-8));
        const ag = -1.5 / (1 + dist);
        for (let d = 0; d < dim; d++) {
          const df = emb[i][d] - emb[j][d];
          const g = clip(ag * df / (dist + 1e-8)) * alpha;
          emb[i][d] += g; emb[j][d] -= g;
        }
        for (let neg = 0; neg < 5; neg++) {
          const k = Math.floor(this.random() * n);
          if (k === i) continue;
          let rSq = 0;
          for (let d = 0; d < dim; d++) { const df = emb[i][d] - emb[k][d]; rSq += df * df; }
          const rD = Math.sqrt(Math.max(rSq, 1e-8));
          const rg = 0.15 / (0.01 + rSq);
          for (let d = 0; d < dim; d++) {
            emb[i][d] += clip(rg * (emb[i][d] - emb[k][d]) / (rD + 1e-8)) * alpha;
          }
        }
      }
      if (ep % 20 === 0 || ep === this.nEpochs - 1) {
        if (cb) cb(ep);
        await new Promise(r => setTimeout(r, 0));
      }
    }
    if (cb) cb(this.nEpochs);
    this.knnIndices = indices;
    return emb.map(r => Array.from(r));
  }
}

export async function runUMAP(vectors, { nComponents = 3, nNeighbors = 15, minDist = 0.1, nEpochs, seed = 42, onProgress } = {}) {
  const epochs = nEpochs || Math.min(300, Math.max(150, vectors.length));
  const neighbors = Math.min(nNeighbors, Math.floor(vectors.length / 10));
  const umap = new UMAP({ nComponents, nNeighbors: neighbors, minDist, nEpochs: epochs, seed });
  const embedding = await umap.fitAsync(vectors, ep => {
    if (onProgress) onProgress(Math.round((ep / epochs) * 100));
  });
  // Normalize to -5..5
  for (let d = 0; d < nComponents; d++) {
    const vals = embedding.map(e => e[d]);
    const mn = Math.min(...vals), mx = Math.max(...vals), range = mx - mn || 1;
    for (let i = 0; i < embedding.length; i++) {
      embedding[i][d] = ((embedding[i][d] - mn) / range) * 10 - 5;
    }
  }
  return { embedding, knnIndices: umap.knnIndices };
}
