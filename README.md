# durag.js

360° data pattern recognition.

Drop a CSV, discover segments, get insights. No AI keys. No backend. Everything runs client-side.

## Install

```bash
npm install durag
```

For the 3D explorer (optional):
```bash
npm install three
```

## Quick Start

```js
import { mount } from 'durag'

// Mount the full experience — upload screen, dashboard, 3D explorer
mount('#app')
```

That's it. One line. Users drop a CSV and get:
- Auto-discovered customer segments
- Real-time computed insights per segment
- Risk detection with exposed revenue
- Searchable customer table
- Optional 3D constellation explorer

## Pass Data Directly

```js
import { mount } from 'durag'

const csv = await fetch('/my-data.csv').then(r => r.text())
mount('#app', csv) // skips upload screen, goes straight to dashboard
```

## Engine Only

Use the analysis engine without the UI:

```js
import { parseCSV, buildVectors, runUMAP, clusterize, analyze } from 'durag/engine'

const { rows, headers } = parseCSV(csvText)
const { vectors } = buildVectors(rows, headers)
const { embedding, knnIndices } = await runUMAP(vectors)
const { labels, k } = clusterize(embedding)
const { clusters } = analyze(rows, headers, embedding, labels, k)

// clusters[0].insights → [
//   "mrr is 3.9x the global average — this is the strongest signal separating this group",
//   "also shows elevated products (4 avg vs 2.5 global) — may be correlated",
//   "high-value segment — 14% of customers but 56% of total revenue"
// ]
```

## How It Works

1. **Parse** — reads any CSV with headers
2. **Profile** — classifies each column as numeric, binary, or categorical
3. **Normalize** — scales all features to 0-1 using appropriate strategies (min-max, robust, ordinal)
4. **Reduce** — UMAP projects high-dimensional vectors into 3D space
5. **Cluster** — k-means finds natural groupings in the embedding
6. **Analyze** — computes z-scores per cluster, generates plain-text insights from the math
7. **Render** — dashboard with segment cards, risk flags, customer table, optional 3D view

Every label, every insight, every number is computed at runtime from the data. No AI. No API calls. Pure math.

## Cleanup

```js
const instance = mount('#app')
// later...
instance.destroy()
```

## License

MIT - Atlantium Inc
