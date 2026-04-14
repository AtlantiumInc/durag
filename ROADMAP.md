# durag.js + wrkflo — Product Roadmap

## What exists today

### durag.js (open source, MIT, npm)
- CSV parser
- Column profiling + auto-normalization (minmax, robust, binary, ordinal)
- UMAP dimensionality reduction (3D)
- K-means++ clustering with seeded PRNG
- Auto-labeling via z-score analysis
- Plain-text insight generation per cluster
- Risk detection (engagement, delinquency, contact gaps)
- Config API: seed, k, features, ignore
- Drop-in UI widget: mount('#app')
- Dashboard: hero stats, segment cards with insights, searchable/sortable table
- Optional 3D constellation explorer (three.js peer dep)
- 37KB full widget, 10KB engine only

### wrkflo.ai (closed source, landing page live)
- Landing page on Cloudflare Pages
- Positioning: autonomous business agent

---

## Phase 1 — Harden durag engine (v0.3–0.5)

### Deterministic output ✅ (done in v0.2.0)
- Seeded PRNG (mulberry32) replaces Math.random()
- K-means++ initialization
- Same data + same seed = same output every time

### Consensus clustering (v0.3)
- Run k-means 10x with different seeds
- Build co-occurrence matrix: how often do rows i and j land together?
- Final clustering from the consensus matrix
- Confidence score per row: 0.95 = always in same cluster, 0.5 = borderline
- Surface confidence in the UI: solid vs dashed borders on segment cards

### Feature importance (v0.3)
- Per cluster: rank which columns contributed most to separation
- Per row: which columns made this row land in this cluster vs another
- Display as "top 3 drivers" on each segment card
- Enable: "why is this customer in this segment?"

### Multi-resolution (v0.4)
- Run at k=4, k=8, k=16 simultaneously
- Macro → meso → micro segments
- UI: zoom slider from broad to granular
- API: durag(csv, { resolution: 'macro' | 'micro' | 'individual' })

### Temporal diff (v0.4)
- durag.diff(resultA, resultB)
- Track which rows moved between clusters
- Output: { moved: [...], newAtRisk: N, recovered: N, stable: N }
- Foundation for wrkflo's continuous monitoring

### Anomaly detection (v0.5)
- Score each row by distance to nearest cluster center
- Rows far from all centers = anomalies
- durag.anomalies(result, { threshold: 0.95 })
- Returns outlier rows with reason: "furthest from all clusters on columns X, Y"

### Per-row scoring (v0.5)
- durag.score(result) → [{ id, healthScore, riskScore, topFactor }]
- Continuous 0-100 score, not just cluster membership
- Sortable, thresholdable, automatable

---

## Phase 2 — durag server (v1.0)

### Node.js server mode
- durag.serve({ port: 3000, db: 'postgres://...' })
- REST API: POST /analyze, GET /clusters, GET /row/:id
- WebSocket: live progress updates during analysis

### Database connectors
- Postgres (pg)
- MySQL
- MongoDB
- Direct Stripe API pull
- Direct HubSpot API pull
- CSV upload (existing)

### Scheduled runs
- Cron: analyze every night at 2am
- Store results in SQLite/Postgres
- Compare current run to previous
- Emit events on segment shifts

### Result persistence
- Store embeddings, cluster assignments, insights per run
- Query historical: "what cluster was customer X in 3 weeks ago?"
- Track trajectory: customer movement over time

---

## Phase 3 — wrkflo agent (closed source product)

### Objective engine
- User sets objectives: "reduce churn by 20%"
- wrkflo maps objective to measurable signals in the data
- Identifies which segments to act on to move the metric
- Generates action plan

### Auto-objectives
- No user input needed
- wrkflo monitors data drift between runs
- Detects: "8 customers moved from high-value to disengaged this week"
- Generates objective: "prevent further migration"
- Creates tasks automatically

### Action integrations
- Email: SendGrid, Postmark, Resend
- Slack: post to channels, DM users
- CRM: Salesforce, HubSpot task creation
- Webhooks: arbitrary HTTP calls
- SMS: Twilio

### Feedback loop
- After actions fire, wrkflo waits for next data run
- Compares: did the acted-on customers improve?
- If yes: reinforce strategy, apply to similar future cases
- If no: flag for review, try different approach
- Tracks ROI: "this automation recovered $12K MRR this month"

### Rules engine
- User defines custom risk conditions:
  risk: { column: 'logins_30d', operator: '<', threshold: 5, weight: 'mrr' }
- Combines with auto-detected patterns
- Explicit (user rules) + implicit (durag patterns) = best of both

### Dashboard (wrkflo.ai web app)
- Overview: active objectives, recent actions, outcomes
- Timeline: what wrkflo did today, this week, this month
- Segment explorer: powered by durag, but in the wrkflo context
- Action log: every email sent, task created, webhook fired
- ROI tracker: MRR saved, churn prevented, upsells triggered

---

## Phase 4 — Scale + network effects

### Benchmark API
- Anonymized, aggregated patterns across all wrkflo users
- "Your churn cluster is 18% of base. Industry average: 12%"
- Requires critical mass of users — long-term play

### Template library
- Pre-built objectives for common use cases:
  - SaaS churn prevention
  - E-commerce repeat purchase
  - Nonprofit donor retention
  - Fintech fraud monitoring
- New users get value in minutes, not hours

### SDK / embed
- wrkflo.embed('#widget') — embed the agent status in any app
- Show users: "wrkflo is monitoring 500 customers, 3 actions pending"
- White-label option for agencies

---

## Revenue model

| Tier | Price | What |
|---|---|---|
| durag.js | Free (MIT) | Engine, npm package, open source forever |
| wrkflo Starter | $49/mo | 1 data source, 1 objective, email actions |
| wrkflo Pro | $199/mo | Unlimited sources, auto-objectives, all integrations |
| wrkflo Enterprise | Custom | On-prem, custom integrations, SLA, dedicated support |

---

## Tech stack

| Layer | Tech |
|---|---|
| durag engine | Vanilla JS, runs in browser or Node |
| durag UI widget | Vanilla DOM, optional three.js |
| wrkflo server | Node.js, Postgres, Redis for job queue |
| wrkflo web app | React, Vite, Tailwind, Cloudflare Pages |
| wrkflo actions | Serverless functions (CF Workers or AWS Lambda) |
| Infrastructure | Cloudflare (Pages, Workers, D1 database) |

---

## What to build next (priority order)

1. **Consensus clustering** — reliability before features
2. **Per-row scoring** — unlocks automation (threshold-based triggers)
3. **Temporal diff** — unlocks wrkflo's core loop (detect change → act)
4. **durag server mode** — unlocks wrkflo backend
5. **Objective engine** — the product differentiator
6. **Action integrations** — Slack + email first, CRM later
7. **Feedback loop** — the moat
