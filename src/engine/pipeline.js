import { parseCSV } from './parser.js';
import { buildVectors } from './normalizer.js';
import { runUMAP } from './umap.js';
import { clusterize } from './kmeans.js';
import { analyze } from './analyzer.js';

/**
 * Full durag pipeline with config.
 * Accepts manual config or AI-generated config from aiConfigToDurag().
 *
 * @param {string} csv - Raw CSV text
 * @param {object} config
 * @param {number} config.seed - Random seed (default: 42)
 * @param {number} config.k - Number of clusters (default: auto)
 * @param {string[]} config.features - Whitelist columns
 * @param {string[]} config.ignore - Blacklist columns
 * @param {number} config.nNeighbors - UMAP neighbors (default: auto from row count)
 * @param {number} config.minDist - UMAP min distance (default: 0.1)
 * @param {function} config.onProgress - Progress callback (0-100)
 * @param {object} config._aiConfig - Full AI config (stored on result for downstream use)
 */
export async function durag(csv, config = {}) {
  const {
    seed = 42,
    k,
    features,
    ignore,
    nNeighbors,
    minDist,
    onProgress,
    _aiConfig,
  } = config;

  const progress = onProgress || (() => {});

  progress(5);
  const { rows, headers } = parseCSV(csv);

  progress(10);
  const { vectors, columns } = buildVectors(rows, headers, { features, ignore });

  progress(15);
  const umapOpts = { seed, onProgress: pct => progress(15 + Math.round(pct * 0.65)) };
  if (nNeighbors) umapOpts.nNeighbors = nNeighbors;
  if (minDist) umapOpts.minDist = minDist;
  const { embedding, knnIndices } = await runUMAP(vectors, umapOpts);

  progress(85);
  const { labels, k: finalK } = clusterize(embedding, { k, seed });

  progress(90);
  const analysis = analyze(rows, headers, embedding, labels, finalK);

  progress(100);

  return {
    rows,
    headers,
    embedding,
    knnIndices,
    clusters: analysis.clusters,
    numericCols: analysis.numericCols,
    mrrCol: analysis.mrrCol,
    nameCol: analysis.nameCol,
    k: finalK,
    meta: {
      seed,
      features: columns,
      rowCount: rows.length,
      clusterCount: finalK,
      aiConfig: _aiConfig || null,
    },
  };
}
