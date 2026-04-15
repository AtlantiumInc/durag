# durag.js

**where patterns emerge.**

A pattern detection engine for tabular data. Feed it rows and columns from any source — Stripe, HubSpot, Postgres, CSV — and it finds the patterns you didn't know to look for.

No AI required. No backend. No API keys. Three lines of code to real results. Optionally pair with any LLM for automatic configuration and natural language strategy.

## What It Does

durag takes your raw data and answers one question: **who in this dataset looks like they're about to have a bad outcome, but hasn't yet?**

It does this by:

1. **Learning what "bad" looks like** from your existing outcomes (churned customers, failed payments, dropped users)
2. **Profiling the difference** between bad and good across every column — which metrics separate them, by how much
3. **Scanning everyone else** for people who match the bad profile but haven't triggered yet

The output is a specific list of people with scores and reasons. Not a percentile. Not a statistical cutoff. A real count that changes based on what the data actually contains.

## Install

```bash
npm install durag
```

## Three Lines to Results

```js
import { parseCSV, findPattern } from 'durag'

const { rows, headers } = parseCSV(csvString)

const numericCols = headers.filter(h => {
  const nums = rows.map(r => parseFloat(r[h])).filter(v => !isNaN(v))
  return nums.length > rows.length * 0.5
})

const pattern = findPattern(rows, numericCols, 'delinquent', 'true')
```

What comes back:

```js
{
  atRiskCount: 6,           // not 75. not a percentile. six real people.
  badCount: 14,             // known bad outcomes in your data
  goodCount: 486,           // everyone else
  
  signals: [                // what separates bad from good
    { column: "support tickets", separation: 5.0, badAvg: 26, goodAvg: 3,
      insight: "support tickets is higher in bad outcomes (26 vs 3) — 5.0 std devs apart" },
    { column: "nps score", separation: 3.9, badAvg: 2, goodAvg: 8,
      insight: "nps score is lower in bad outcomes (2 vs 8) — 3.9 std devs apart" },
  ],
  
  atRisk: [                 // the 6 people, with match scores and reasons
    { name: "Titan Platform", _signalScore: 77,
      _signalReasons: ["low mrr (3161 — bad avg: 3294, good avg: 3868)"] },
  ],

  message: "6 customers match the profile of the 14 known bad outcomes
            but haven't triggered yet. These are your true pre-signals."
}
```

The number 6 is real because it comes from pattern matching against known outcomes, not from a formula. Run it on a different dataset and you'll get a different number — 0 if nobody matches, 163 if half your base is sliding.

## How findPattern Works

**Step 1: Split the data.** Your outcome column (e.g., `delinquent`) divides rows into two groups — bad (14 customers) and good (486 customers).

**Step 2: Profile each group.** For every numeric column, compute the average for bad vs good. Support tickets: bad avg 26, good avg 3. NPS: bad avg 2, good avg 8. This creates a "fingerprint" of what bad looks like.

**Step 3: Rank columns by separation.** Measure how many standard deviations apart the bad and good averages are. Support tickets: 5.0 std devs (massive gap). Products: 0.3 std devs (barely different). Only columns with real separation matter.

**Step 4: Score everyone in the good group.** For each non-bad customer, compute how similar their values are to the bad profile vs the good profile. Someone with 20 tickets and NPS 3 looks like the bad group. Someone with 1 ticket and NPS 9 doesn't.

**Step 5: Return the matches.** Customers above the similarity threshold (default 0.7) are your pre-signals. If there's no natural group above the threshold, durag says so — "no customers closely match the bad outcome profile."

## The Full Pipeline

For deeper analysis, durag also offers clustering, dimensionality reduction, and a question-answering engine:

```js
import { durag, ask, enrich, findPattern } from 'durag'

// Full pipeline: normalize → UMAP → cluster → analyze
const result = await durag(csvString, { seed: 42 })

// Ask natural language questions
const answer = ask("who's about to churn?", result)
// → { count: 14, confidence: 87%, reasons: [...], suggestedAction: "..." }

// Correlation-based intelligence
const enriched = enrich(result)
// → { intelligence: { outcomeCol, featureImportance, compounds } }

// True signal detection
const pattern = findPattern(result.rows, result.numericCols, 'delinquent', 'true')
// → { atRiskCount: 6, signals: [...], atRisk: [...] }
```

### What each function does:

**`durag(csv, config)`** — The full pipeline. Parses CSV, normalizes columns (auto-picks min-max, robust, binary, or ordinal per column), runs UMAP for 3D dimensionality reduction, clusters with seeded K-means++, auto-labels clusters by z-score analysis, generates plain-text insights. Returns rows, clusters, embedding, and metadata.

**`ask(question, result)`** — Natural language question answering. Uses a polarity system that reads column names to determine if high is good or bad for each column, then scores every row against the question's intent. "Who's about to churn?" scores rows where negative-polarity columns are extreme. Returns a count, confidence score, reasons, and suggested action. Adaptive threshold: returns 14 when there's a tight cluster, 75 when the distribution is smooth (statistical outliers, not a discovery).

**`enrich(result)`** — Intelligence layer. Auto-detects the outcome column, computes Pearson correlation between every numeric column and the outcome, ranks features by correlation strength, and detects compound signals ("low NPS + high support tickets → 2.5x delinquent rate"). Uses the `simple-statistics` package for proper statistical computation.

**`findPattern(rows, numericCols, outcomeCol, badValue)`** — True signal detection. Learns the profile of known bad outcomes, scores every good customer on similarity to that profile, returns the ones who match. Every result count is unique to the data — no percentile defaults.

## With AI (Optional)

durag works alone. But paired with any LLM, it gets smarter.

### AI configures durag

The AI reads your column names (not your data) and fills in the configuration — which column is the outcome, what value is bad, which columns to cluster on, what risk thresholds to set. One API call, ~200 tokens, ~$0.01.

```js
import { profileForAI, buildTunePrompt, parseAIConfig, aiConfigToDurag, durag } from 'durag'

// Generate a data profile (column names + types + ranges)
const profile = profileForAI(csv)

// Build the prompt for any LLM
const prompt = buildTunePrompt(profile)

// Send to your LLM of choice
const response = await yourLLM(prompt)

// Parse the response into durag config
const config = parseAIConfig(response)

// Run durag with AI's configuration
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

The LLM can't read 100K rows. durag can, but its text output is generic. Together: durag compresses the data, AI reasons about the compressed context. Each does what the other can't.

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

## Drop-in Widget

For a complete UI with no code:

```js
import { mount } from 'durag'

mount('#app')
```

Renders: upload screen → tuning screen (configure outcome, revenue, identity columns) → dashboard with True Signal section, intelligence, segments, ask bar, customer table, and optional 3D constellation explorer. Includes light/dark mode.

## What's Inside

```
durag/
├── src/
│   ├── engine/
│   │   ├── signal.js      ← findPattern() — true signal detection
│   │   ├── ask.js         ← ask() — natural language polarity scoring
│   │   ├── intelligence.js ← enrich() — correlation, compounds
│   │   ├── ai-tune.js     ← AI configuration helpers
│   │   ├── pipeline.js    ← durag() — full pipeline orchestrator
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
│   ├── durag.esm.js       ← ES module (37KB)
│   └── durag.umd.js       ← UMD bundle
└── package.json
```

## Real Results — AI-Tuned, 5 Datasets

Every number below was produced by one AI call (configuration) + one `findPattern()` call (detection). No hardcoded thresholds. The AI picked the outcome, the bad value, and the clustering features. durag found the patterns.

| Dataset | AI's outcome choice | Known bad | Pre-signal found | Top signal |
|---|---|---|---|---|
| **Stripe** | `delinquent = true` | 65 | **71** | NPS 1.1σ apart, logins 0.9σ, tickets 0.6σ |
| **SaaS Usage** | `last_login_days > 30` | 108 | **35** | Login days 2.2σ apart, NPS 1.9σ, logins_7d 1.2σ |
| **Ecommerce** | `days_since_last_order > 180` | 156 | **22** | Days since order 2.0σ, orders_90d 1.2σ, categories 1.2σ |
| **HubSpot** | `days_since_last_activity > 180` | 119 | **25** | Activity days 2.1σ, email opens 1.2σ, clicks 1.2σ |
| **Fintech** | `overdraft_count_12m > 3` | 67 | **11** | Overdrafts 2.5σ, credit score 1.5σ, support calls 1.4σ |

**71, 35, 22, 25, 11.** Five unique numbers from five different datasets. Each one is the real count of people who match the bad outcome profile but haven't triggered yet.

What the AI configured per industry:
- **Stripe**: Binary outcome, obvious. Clustered on MRR, products, NPS, contact days, tickets.
- **SaaS**: No binary column existed — AI created a proxy (`last_login_days > 30`). Clustered on behavioral metrics only.
- **Ecommerce**: AI set a 180-day lapse threshold. Found 22 customers about to go dark from a base of 500.
- **HubSpot**: Same proxy strategy — `days_since_last_activity > 180`. Found 25 dead leads with deal value still on the books.
- **Fintech**: AI picked overdraft count > 3 as financial distress. Found 11 accounts spiraling — with specific credit scores and support call patterns.

Sample output (Fintech, 11 pre-signal customers):
```
Henry Miller      score=69%  low credit score (617 — bad avg: 592, good avg: 715)
Matthew Sanchez   score=68%  low credit score (619 — bad avg: 592, good avg: 715)
Ava Clark         score=67%  low credit score (639 — bad avg: 592, good avg: 715)
Leo Wright        score=67%  high support calls (14 — bad avg: 8, good avg: 3)
Nathan Ramirez    score=65%  low credit score (562 — bad avg: 592, good avg: 715)
```

## Additional Datasets Tested

- Workspace analytics (seats, messages, admin activity)
- Marketplace sellers (listings, ratings, revenue)
- Wealth management clients (portfolio, meetings, AUM)
- EdTech learners (courses, quiz scores, completion)
- Healthcare patient engagement (appointments, adherence, no-shows)
- Denver nonprofit member data (food pantry, counseling, crisis events)

Same engine, different data, different patterns every time.

## License

MIT — [Atlantium Inc](https://github.com/AtlantiumInc)
