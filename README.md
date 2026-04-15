# durag.js

**where patterns emerge.**

A pattern detection engine for tabular data. Feed it rows and columns from any source — Stripe, HubSpot, Postgres, CSV — and it finds the patterns you didn't know to look for.

No AI required. No backend. No API keys. Optionally pair with any LLM for automatic configuration and natural language strategy.

## Two Modes, One Engine

durag operates in two modes depending on what you know going in:

| | **Discovery Mode** | **Signal Mode** |
|---|---|---|
| **Function** | `durag()` | `findPattern()` |
| **Question** | "What segments exist in my data?" | "Who looks like X?" |
| **Input** | Raw CSV, no target needed | CSV + outcome column + target value |
| **Output** | Clusters, labels, insights | Matches, signals, risk scores |
| **Use when** | You don't know what to look for | You know the outcome, want lookalikes |

### Discovery Mode — `durag()`

Drop a CSV. Get segments. No questions asked.

```js
import { durag } from 'durag'

const result = await durag(csvString, { k: 4 })
```

What comes back:

```js
{
  k: 4,                          // 4 natural segments found
  clusters: {
    0: {
      label: "high evening charges",  // auto-labeled by what separates them
      count: 2221,                     // 67% of your base
      pct: 67,
      atRisk: false,
      insights: [
        "this is your largest segment at 67% — any improvement here moves the needle"
      ]
    },
    1: {
      label: "low phone activity",
      count: 352,                      // 11% — potentially disengaging
      pct: 11,
      atRisk: false,
    },
    2: {
      label: "low customer service calls",
      count: 494,                      // 15% — happy or silently churning?
      pct: 15,
    },
    3: {
      label: "low intl charge",
      count: 266,                      // 8% — compound risk factor
      pct: 8,
      insights: [
        "paired with low Intl Mins — a compound risk factor"
      ]
    }
  },
  numericCols: ["Account Length", "Day Mins", "Day Charge", ...],
  embedding: [...],               // UMAP 2D coordinates for visualization
  meta: { seed: 42, rowCount: 3333, clusterCount: 4 }
}
```

durag doesn't know what churn is. It doesn't know what revenue is. It just finds the natural groupings in your data by behavioral similarity — normalizes columns, reduces dimensions with UMAP, clusters with K-means++, then auto-labels each cluster by what makes it different.

### How Discovery Mode Works

1. **Parse & normalize.** Auto-detects column types (numeric, binary, categorical, ordinal). Picks the right normalization per column — min-max for normal distributions, robust for skewed data, binary encoding for yes/no, ordinal for tiers.
2. **Reduce dimensions.** UMAP compresses all columns into 2D space where similar records cluster together. A customer with high MRR + high logins + low tickets lands near other customers with the same profile.
3. **Cluster.** Seeded K-means++ groups the 2D points into k segments. Auto-picks k if you don't specify it.
4. **Label & analyze.** For each cluster, computes z-scores across all numeric columns to find what separates it from the rest. The column with the highest z-score becomes the label. Generates plain-text insights.

### Signal Mode — `findPattern()`

You know the outcome. Show me who's next.

```js
import { parseCSV, findPattern } from 'durag'

const { rows, headers } = parseCSV(csvString)

const numericCols = headers.filter(h => {
  const nums = rows.map(r => parseFloat(r[h])).filter(v => !isNaN(v))
  return nums.length > rows.length * 0.5
})

const pattern = findPattern(rows, numericCols, 'Churn?', 'True.', { allHeaders: headers })
```

What comes back:

```js
{
  matchCount: 1,              // 1 person matches the churn profile but hasn't churned
  targetCount: 483,           // known churners
  baseCount: 2850,            // everyone else

  signals: [                  // what separates churners from retained, ranked
    { column: "Int'l Plan = yes", separation: 0.7,
      targetAvg: 0.28, baseAvg: 0.07,
      insight: "Int'l Plan = yes: 28% in target vs 7% in base — 0.7 std devs" },
    { column: "CustServ Calls", separation: 0.6,
      targetAvg: 2, baseAvg: 1,
      insight: "CustServ Calls is higher in target group (2 vs 1) — 0.6 std devs apart" },
    { column: "Day Mins", separation: 0.6,
      targetAvg: 207, baseAvg: 175,
      insight: "Day Mins is higher in target group (207 vs 175) — 0.6 std devs apart" },
  ],

  matching: [                 // the at-risk records with scores and reasons
    { State: "UT", _matchScore: 72,
      _matchReasons: ["high CustServ Calls (3 — target avg: 2, base avg: 1)",
                       "high Day Mins (209 — target avg: 207, base avg: 175)"] },
  ],

  message: "1 records match the profile of the 483 target records but aren't in the target group yet."
}
```

### How Signal Mode Works

**Step 1: Split the data.** Your outcome column divides rows into two groups — target (483 churners) and base (2,850 retained).

**Step 2: Profile each group.** For every numeric column, compute the average for target vs base. Day Mins: churners avg 207, retained avg 175. This creates a fingerprint of what the target looks like.

**Step 3: Expand categoricals.** Columns like `Int'l Plan` (yes/no) get one-hot encoded into binary features. This lets durag detect patterns like "28% of churners have international plans vs 7% of retained."

**Step 4: Rank columns by separation.** Measure how many standard deviations apart the target and base averages are. Only columns with real separation (>0.2 std devs) matter.

**Step 5: Score everyone in the base group.** For each non-target record, compute how similar their values are to the target profile vs the base profile.

**Step 6: Return the matches.** Records above the similarity threshold (default 0.7) are your pre-signals. If nobody matches, durag says so.

## Using Both Together

The power play: discover first, then investigate.

```js
import { durag, findPattern } from 'durag'

// Step 1: What segments exist?
const result = await durag(csvString, { k: 4 })
// → "You have 4 segments. Cluster 3 is at-risk — low intl usage, compound factor."

// Step 2: Who in cluster 3 looks like they'll churn?
const atRisk = findPattern(
  result.rows,
  result.numericCols,
  'Churn?',
  'True.',
  { allHeaders: result.headers }
)
// → "1 customer matches the churn profile. Here's who and why."
```

## Install

```bash
npm install durag
```

## With AI (Optional)

durag works alone. But paired with any LLM, it gets smarter.

### AI configures durag

The AI reads your column names (not your data) and fills in the configuration — which column is the outcome, what value is bad, which columns to cluster on. One API call, ~200 tokens, ~$0.01.

```js
import { profileForAI, buildTunePrompt, parseAIConfig, aiConfigToDurag, durag } from 'durag'

const profile = profileForAI(csv)
const prompt = buildTunePrompt(profile)
const response = await yourLLM(prompt)
const config = parseAIConfig(response)
const result = await durag(csv, aiConfigToDurag(config))
```

### AI reads durag's output

durag compresses your data into structured context. 500 rows of CSV (~10,000 tokens) becomes ~800 tokens of clusters, signals, and scores. Feed that to an LLM and it generates specific strategy:

```js
const pattern = findPattern(result.rows, result.numericCols, 'delinquent', 'true')

const strategy = await yourLLM(
  `Analysis of ${result.rows.length} customers:\n${JSON.stringify(pattern)}\nWhat should we do this week?`
)
// → "Schedule immediate calls with these 6 accounts by Friday.
//    $7,203 MRR at risk. Start with Titan Platform — highest match score."
```

### Why both?

| | LLM alone | durag alone | AI + durag |
|---|---|---|---|
| 500 rows | Works. $0.60. Slow. | Works. Free. Instant. | Works. $0.02. Instant. |
| 50K rows | Can't. Context limit. | Works. Free. | Works. $0.02. |
| 5M rows | Impossible. | Works. Seconds. | Works. $0.02. |
| Deterministic | No | Yes | Yes |
| Actionable output | Yes | Generic | Yes |

## Configuration

```js
const result = await durag(csv, {
  seed: 42,              // deterministic output (same input → same result)
  k: 8,                  // number of clusters (default: auto)
  features: ['mrr', 'logins', 'nps'],   // only use these columns
  ignore: ['id', 'email', 'created'],    // skip these columns
  nNeighbors: 15,        // UMAP neighbors (default: auto from row count)
  minDist: 0.1,          // UMAP spread (default: 0.1)
})
```

## Additional APIs

**`ask(question, result)`** — Natural language question answering over durag output. Uses a polarity system that reads column names to determine if high is good or bad, then scores every row against the question's intent. Returns a count, confidence score, reasons, and suggested action.

**`enrich(result)`** — Intelligence layer. Auto-detects outcome column, computes Pearson correlation between every numeric column and the outcome, ranks features by correlation strength, and detects compound signals ("low NPS + high support tickets = 2.5x delinquent rate").

**`merge(sources)`** — Combine multiple CSVs by a shared key column, then run analysis on the unified dataset.

**`mount('#app')`** — Drop-in widget. Renders a complete UI with upload, tuning, dashboard, segments, ask bar, customer table, and optional 3D constellation explorer.

## What's Inside

```
durag/
├── src/
│   ├── engine/
│   │   ├── pipeline.js    ← durag() — discovery mode orchestrator
│   │   ├── signal.js      ← findPattern() — signal mode detection
│   │   ├── ask.js         ← ask() — natural language scoring
│   │   ├── intelligence.js ← enrich() — correlation, compounds
│   │   ├── ai-tune.js     ← AI configuration helpers
│   │   ├── merge.js       ← multi-source data fusion
│   │   ├── umap.js        ← dimensionality reduction
│   │   ├── kmeans.js      ← seeded K-means++ clustering
│   │   ├── normalizer.js  ← column profiling + normalization
│   │   ├── analyzer.js    ← cluster analysis + insight generation
│   │   ├── parser.js      ← CSV parser
│   │   └── rng.js         ← seeded PRNG (deterministic randomness)
│   └── ui/
│       ├── index.js       ← mount() — drop-in widget
│       └── styles.js      ← scoped CSS
├── dist/
│   ├── durag.esm.js       ← ES module
│   ├── durag.umd.js       ← UMD bundle
│   ├── engine.esm.js      ← Engine-only (no UI)
│   └── engine.umd.js      ← Engine-only UMD
└── package.json
```

## Real Results

### IBM Telco Customer Churn (7,043 customers)

**Discovery mode** found 4 natural segments without knowing what churn is. **Signal mode** then identified 248 pre-signal customers matching the churn profile — newer customers paying higher monthly charges who haven't left yet.

### AI-Tuned, 5 Industries

| Dataset | AI's outcome choice | Known bad | Pre-signal found | Top signal |
|---|---|---|---|---|
| **Stripe** | `delinquent = true` | 65 | **71** | NPS 1.1 std apart |
| **SaaS Usage** | `last_login_days > 30` | 108 | **35** | Login days 2.2 std apart |
| **Ecommerce** | `days_since_last_order > 180` | 156 | **22** | Days since order 2.0 std apart |
| **HubSpot** | `days_since_last_activity > 180` | 119 | **25** | Activity days 2.1 std apart |
| **Fintech** | `overdraft_count_12m > 3` | 67 | **11** | Overdrafts 2.5 std apart |

Five datasets, five unique counts. Each one is the real number of people matching the bad profile who haven't triggered yet.

## When durag Works Well

- Numeric behavioral columns with variance (MRR, logins, NPS, tenure, charges)
- Clear binary outcomes for signal mode (churned/retained, delinquent/current)
- 500+ rows with 3+ numeric columns
- Cross-source patterns when merging multiple CSVs

## When durag Struggles

- Mostly categorical data (plan names, regions, statuses without numeric metrics)
- No clear outcome column for signal mode (discovery mode still works)
- Under 50 rows — averages are unreliable
- Opaque column names like `field_47` — suggest AI tuning

## License

MIT — [Atlantium Inc](https://github.com/AtlantiumInc)
