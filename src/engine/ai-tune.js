import { profileColumn } from './normalizer.js';
import { parseCSV } from './parser.js';

/**
 * Generate a data profile summary for AI to reason about.
 * This is what gets sent to the LLM — column names, types, distributions.
 * Small enough for a single API call (~300-500 tokens).
 */
export function profileForAI(csv) {
  const { rows, headers } = typeof csv === 'string' ? parseCSV(csv) : { rows: csv.rows || csv, headers: csv.headers || Object.keys(csv[0]) };

  const profiles = {};
  for (const h of headers) {
    const values = rows.map(r => r[h]).filter(v => v !== '' && v !== null && v !== undefined);
    const unique = [...new Set(values)];
    const nums = values.map(v => parseFloat(v)).filter(v => !isNaN(v));

    if (unique.length <= 2) {
      profiles[h] = { type: 'binary', values: unique.slice(0, 2) };
    } else if (nums.length > values.length * 0.5) {
      const sorted = [...nums].sort((a, b) => a - b);
      profiles[h] = {
        type: 'numeric',
        min: sorted[0],
        max: sorted[sorted.length - 1],
        median: sorted[Math.floor(sorted.length / 2)],
        mean: Math.round(nums.reduce((a, b) => a + b, 0) / nums.length * 10) / 10,
        pctEmpty: Math.round((values.length - nums.length) / rows.length * 100),
        skewed: sorted[sorted.length - 1] > (nums.reduce((a, b) => a + b, 0) / nums.length) * 5,
      };
    } else {
      profiles[h] = { type: 'categorical', unique: unique.length, topValues: unique.slice(0, 5) };
    }
  }

  return {
    rowCount: rows.length,
    columnCount: headers.length,
    columns: headers,
    profiles,
  };
}

/**
 * Build the prompt that asks an LLM to configure durag.
 * Returns the prompt string — caller sends it to their LLM of choice.
 */
export function buildTunePrompt(dataProfile) {
  return `You are configuring a data analysis engine. Here is a dataset profile:

Rows: ${dataProfile.rowCount}
Columns: ${dataProfile.columnCount}

Column details:
${Object.entries(dataProfile.profiles).map(([col, p]) => {
    if (p.type === 'binary') return `  ${col}: binary [${p.values.join(', ')}]`;
    if (p.type === 'numeric') return `  ${col}: numeric (min=${p.min}, max=${p.max}, median=${p.median}, mean=${p.mean}${p.skewed ? ', skewed' : ''}${p.pctEmpty > 0 ? ', ' + p.pctEmpty + '% empty' : ''})`;
    return `  ${col}: categorical (${p.unique} unique values: ${p.topValues.join(', ')}${p.unique > 5 ? '...' : ''})`;
  }).join('\n')}

Return ONLY a JSON object with these fields:

{
  "outcomeColumn": "column name that best indicates negative outcome (churn, failure, etc), or null if none",
  "badValue": "the value that means bad (for binary cols) or null",
  "outcomeThreshold": { "operator": ">", "value": 90 } or null (for numeric outcome columns),
  "revenueColumn": "column name for revenue/MRR, or null",
  "nameColumn": "column name for customer identity, or null",
  "k": number of clusters (consider dataset size and likely number of distinct behavioral groups),
  "clusterFeatures": ["columns to cluster ON — behavioral/engagement columns only"],
  "excludeFromClustering": ["columns that are IDs, names, or descriptive only"],
  "normalizerOverrides": { "columnName": "log" } (for heavily skewed numeric columns that need log transform),
  "umapNeighbors": number (5 for <100 rows, 15 for 100-1000, 30 for 1000+),
  "umapMinDist": number (0.1 for tight clusters, 0.3 for spread out),
  "riskThresholds": { "columnName": { "operator": "<", "value": 5 } } (what counts as at-risk per column, based on the data ranges you see),
  "suggestedQuestions": ["5 specific business questions to ask this data, using actual column names"],
  "reasoning": "one sentence explaining your choices"
}

Be specific. Use actual column names and values from the profile. Consider the data ranges when setting thresholds.`;
}

/**
 * Parse the AI's response into a durag config object.
 * Handles common LLM output quirks (markdown fences, extra text).
 */
export function parseAIConfig(responseText) {
  // Strip markdown code fences if present
  let text = responseText.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  // Find the JSON object
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in AI response');
  return JSON.parse(text.substring(start, end + 1));
}

/**
 * Convert AI config into durag() options.
 * Maps the AI's decisions to the parameters durag accepts.
 */
export function aiConfigToDurag(aiConfig) {
  const opts = { seed: 42 };

  if (aiConfig.k) opts.k = aiConfig.k;
  if (aiConfig.clusterFeatures) opts.features = aiConfig.clusterFeatures;
  if (aiConfig.excludeFromClustering) opts.ignore = aiConfig.excludeFromClustering;
  if (aiConfig.umapNeighbors) opts.nNeighbors = aiConfig.umapNeighbors;
  if (aiConfig.umapMinDist) opts.minDist = aiConfig.umapMinDist;

  // Store the full AI config for downstream use
  opts._aiConfig = aiConfig;

  return opts;
}

/**
 * Full AI-tuned pipeline helper.
 *
 * Usage with any LLM:
 *
 *   const profile = profileForAI(csv)
 *   const prompt = buildTunePrompt(profile)
 *   const aiResponse = await yourLLM(prompt)  // call your LLM
 *   const config = parseAIConfig(aiResponse)
 *   const opts = aiConfigToDurag(config)
 *   const result = await durag(csv, opts)
 */
export const aiTune = {
  profileForAI,
  buildTunePrompt,
  parseAIConfig,
  aiConfigToDurag,
};
