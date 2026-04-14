import { parseCSV } from './parser.js';
import { buildVectors } from './normalizer.js';
import { runUMAP } from './umap.js';
import { clusterize } from './kmeans.js';
import { analyze } from './analyzer.js';

/**
 * Full durag pipeline with config.
 *
 * @param {string} csv - Raw CSV text
 * @param {object} config
 * @param {number} config.seed - Random seed for deterministic output (default: 42)
 * @param {number} config.k - Number of clusters (default: auto)
 * @param {string[]} config.features - Whitelist of column names to use
 * @param {string[]} config.ignore - Blacklist of column names to skip
 * @param {string} config.revenue - Column name for revenue/MRR
 * @param {string} config.identity - Column name for row identity (name/email)
 * @param {function} config.onProgress - Progress callback (0-100)
 * @returns {object} { rows, headers, clusters, embedding, knnIndices, meta }
 */
export async function durag(csv, config = {}) {
  const {
    seed = 42,
    k,
    features,
    ignore,
    onProgress,
  } = config;

  const progress = onProgress || (() => {});

  progress(5);
  const { rows, headers } = parseCSV(csv);

  progress(10);
  const { vectors, columns } = buildVectors(rows, headers, { features, ignore });

  progress(15);
  const { embedding, knnIndices } = await runUMAP(vectors, {
    seed,
    onProgress: pct => progress(15 + Math.round(pct * 0.65)),
  });

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
    },
  };
}
