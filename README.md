# durag.js

**where patterns emerge.**

The pattern engine for your data. Finds segments, computes insights, answers questions — from any CSV, any size, in milliseconds.

Alone, it's fast and free. With AI, it's accurate at scale. Together, they do what neither can alone.

## The Problem

| | Raw data → LLM | durag alone | AI + durag |
|---|---|---|---|
| 500 rows | Works. $0.60. 2 min. | Works. Free. Instant. | Works. $0.02. Instant. |
| 50K rows | Can't. Context limit. | Works. Free. 30 sec. | Works. $0.02. 30 sec. |
| 500K rows | Impossible. | Works. Free. 5 min. | Works. $0.02. 5 min. |
| Deterministic | No | Yes | Yes |
| Actionable output | Yes | Mediocre | Yes |

AI can't read 100K rows. durag can, but its output is generic. Together: durag compresses 100K rows into 800 tokens of structured context. AI reads 800 tokens and generates strategy with specific names, numbers, and timelines.

## Install

```bash
npm install durag
```

## Quick Start — Drop-in Widget

```js
import { mount } from 'durag'
mount('#app')
```

One line. Upload screen → tuning → dashboard with segments, insights, and ask bar.

## Quick Start — Engine Only

```js
import { durag, ask } from 'durag'

const result = await durag(csvString, { seed: 42 })
const answer = ask("who's about to churn?", result)
// → { count: 14, confidence: 87, insight: "14 customers (3%) match...", reasons: [...] }
```

## Quick Start — AI + durag (the unlock)

```js
import { durag, ask, enrich } from 'durag'
import Anthropic from '@anthropic-ai/sdk'

const csv = await fetch('/api/customers').then(r => r.text())

// 1. AI configures durag (one call, ~200 tokens)
const client = new Anthropic()
const config = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 300,
  messages: [{
    role: 'user',
    content: `Columns: ${headers.join(', ')}\nReturn JSON: {outcomeColumn, badValue, revenueColumn, excludeColumns, suggestedQuestions}`
  }]
})

// 2. durag runs the math (free, instant, deterministic)
const result = await durag(csv, { seed: 42, ignore: config.excludeColumns })
const enriched = enrich(result)

// 3. AI reads structured context (one call, ~800 tokens instead of 100K)
const strategy = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 600,
  messages: [{
    role: 'user',
    content: `Analysis of ${result.meta.rowCount} customers:\n${JSON.stringify(enriched.intelligence)}\nWhat should we do this week?`
  }]
})
```

Two AI calls ($0.02). One durag pass (free). 100K rows compressed to 800 tokens. Specific, actionable strategy with dollar amounts and timelines.

## What durag computes

- **Normalization** — auto-profiles every column, picks the right scaling strategy
- **UMAP** — dimensionality reduction, finds which dimensions actually matter
- **K-means++** — clusters similar records, seeded for deterministic output
- **Correlation polarity** — computes which columns drive the outcome (not guessed from names)
- **Compound signals** — "low NPS + high support tickets → 2.5x delinquent rate"
- **ask()** — natural language questions scored by polarity with adaptive thresholds
- **enrich()** — outcome detection, feature importance, compound signal detection

## Configuration

```js
const result = await durag(csv, {
  seed: 42,           // deterministic output
  k: 8,               // override cluster count
  features: ['mrr', 'logins', 'nps'],  // whitelist columns
  ignore: ['id', 'email'],              // blacklist columns
})
```

## Tuning (UI)

The drop-in widget includes a tuning screen after CSV upload:
- Select outcome column (what you're trying to prevent)
- Set bad value or numeric threshold
- Choose revenue and identity columns
- Exclude irrelevant columns
- Or skip and auto-detect everything

## License

MIT — [Atlantium Inc](https://github.com/AtlantiumInc)
