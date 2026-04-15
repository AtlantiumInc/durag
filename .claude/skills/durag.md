---
name: durag
description: Analyze any CSV or tabular data file to find patterns. Detects which records match a target outcome profile, ranks signals by separation strength, and merges multiple data sources for cross-system pattern detection.
trigger: When the user asks to analyze data, find patterns in a CSV, detect churn, find similar records, profile customers, or merge data sources. Also triggers on "/durag" command.
---

# durag — pattern detection skill

You have access to the `durag` npm package. Use it to analyze tabular data files.

## Installation

If durag is not installed in the current project, install it first:

```bash
npm install durag
```

## Core Commands

### Analyze a single file

When the user asks to analyze a CSV file or find patterns:

1. Read the CSV file
2. Identify numeric columns and a likely outcome column
3. Run `findPattern()` 
4. Present the results clearly

```js
import { parseCSV, findPattern } from 'durag';
import fs from 'fs';

const csv = fs.readFileSync('PATH_TO_FILE', 'utf-8');
const { rows, headers } = parseCSV(csv);

// Find numeric columns
const numericCols = headers.filter(h => {
  const nums = rows.map(r => parseFloat(r[h])).filter(v => !isNaN(v));
  return nums.length > rows.length * 0.5;
});

// Run pattern detection
const pattern = findPattern(rows, numericCols, 'OUTCOME_COL', 'TARGET_VALUE');
```

### Merge multiple files

When the user wants to combine data sources:

```js
import { merge, findPattern, parseCSV } from 'durag';

const unified = merge([
  { csv: csv1, prefix: 'source1', key: 'email' },
  { csv: csv2, prefix: 'source2', key: 'email' },
]);

const numericCols = unified.headers.filter(h => {
  const nums = unified.rows.map(r => parseFloat(r[h])).filter(v => !isNaN(v));
  return nums.length > unified.rows.length * 0.3;
});

const pattern = findPattern(unified.rows, numericCols, 'source1_outcome', 'true');
```

### AI-tuned analysis

When the user wants AI to configure the analysis:

```js
import { profileForAI, buildTunePrompt, parseAIConfig, aiConfigToDurag, durag, findPattern } from 'durag';

const profile = profileForAI(csv);
const prompt = buildTunePrompt(profile);
// Use Claude to answer the prompt, then parse the config
const config = parseAIConfig(aiResponse);
const result = await durag(csv, aiConfigToDurag(config));
```

## How to Present Results

### For findPattern results:

```
## Pattern Analysis: [filename]

**[matchCount] records** match the profile of [targetCount] target records.

### What separates the target group:
- [signal 1 insight]
- [signal 2 insight]
- [signal 3 insight]

### Top matching records:
| Score | ID/Name | Reason |
|-------|---------|--------|
| 88%   | ...     | ...    |
```

### For merge results:

```
## Merged Analysis: [source count] sources

**Sources joined on:** [key column]
**Matched rows:** [count]
**Total columns:** [count]

### Single source: [X] matches
### Merged: [Y] matches — [more/fewer] with [higher/lower] confidence
```

## Deciding the Outcome Column

When the user doesn't specify what to analyze:

1. Look for binary columns first: `churn`, `churned`, `delinquent`, `canceled`, `converted`, `status`, `active`
2. If none found, look for numeric columns that could be thresholded: `last_login_days`, `days_since_last_order`, `days_since_last_activity`
3. Ask the user: "I found these columns — which one represents the outcome you care about?"
4. For numeric outcomes, suggest a threshold: "Should I use `last_login_days > 30` as the target?"

## Deciding the Join Key

When merging, look for email, customer_id, account_id, user_id, or any column that appears to be an identifier shared across files. If unclear, ask the user.

## What durag Does Well

- Numeric behavioral data (MRR, logins, NPS, tenure, charges)
- Clear binary outcomes (churned/retained, delinquent/current)
- 500+ rows with 3+ numeric columns
- Cross-source patterns when merging multiple CSVs

## What durag Struggles With

- Mostly categorical data (plan names, regions, statuses without numeric metrics)
- No clear outcome column — suggest the user pick one or create a proxy
- Under 50 rows — averages are unreliable
- Opaque column names like `field_47` — suggest AI tuning

## Example Interactions

User: "analyze my customers.csv for churn risk"
→ Read the file, identify outcome column (likely `churn` or `status`), run findPattern, present results

User: "merge stripe.csv and hubspot.csv and find patterns"  
→ Identify shared key column, run merge, then findPattern on the merged data

User: "who in this dataset looks like they're about to convert?"
→ findPattern with a positive target (e.g., `converted=true`), present matches as "likely to convert"

User: "what patterns do you see in this data?"
→ Profile the columns, identify a likely outcome, run findPattern, present signals ranked by separation

User: "/durag sales.csv --target deal_status=won"
→ Direct command, run findPattern immediately with specified outcome
