import { sampleCorrelation, linearRegression, standardDeviation, mean, quantile } from 'simple-statistics';

/**
 * Auto-detect the outcome column.
 * Looks for binary columns (status, churn, canceled, converted, active, etc.)
 * and picks the one with the strongest correlations to other columns.
 */
export function detectOutcome(rows, headers) {
  // Find binary columns
  const binaryCols = headers.filter(h => {
    const vals = [...new Set(rows.map(r => String(r[h] || '').toLowerCase()))];
    if (vals.length !== 2) return false;
    // Check if the values look like outcome pairs
    const outcomePairs = [
      ['true', 'false'], ['yes', 'no'], ['active', 'canceled'], ['active', 'churned'],
      ['active', 'inactive'], ['won', 'lost'], ['converted', 'not_converted'],
      ['1', '0'], ['alive', 'dead'], ['retained', 'churned'], ['open', 'closed'],
      ['completed', 'dropped'], ['graduated', 'dropped']
    ];
    const sorted = vals.sort();
    const isOutcomePair = outcomePairs.some(p => {
      const ps = [...p].sort();
      return (sorted[0] === ps[0] && sorted[1] === ps[1]);
    });
    if (isOutcomePair) return true;
    // Also check column name for outcome keywords
    const lc = h.toLowerCase();
    return ['status', 'churn', 'cancel', 'convert', 'outcome', 'result', 'active', 'delinquent', 'lost', 'won'].some(k => lc.includes(k));
  });

  if (binaryCols.length === 0) return null;

  // Find numeric columns for correlation
  const numericCols = headers.filter(h => {
    const vals = rows.map(r => parseFloat(r[h])).filter(v => !isNaN(v));
    return vals.length > rows.length * 0.5 && !binaryCols.includes(h);
  });

  if (numericCols.length === 0) return binaryCols[0]; // fallback to first binary col

  // Score each binary column by how many numeric columns it correlates with
  let bestCol = null, bestTotalCorr = 0;

  for (const bc of binaryCols) {
    // Encode binary to 0/1
    const vals = rows.map(r => String(r[bc] || '').toLowerCase());
    const unique = [...new Set(vals)].sort();
    // Determine which value is "negative" (churn, canceled, false, etc.)
    const negWords = ['canceled', 'churned', 'inactive', 'lost', 'false', 'no', '0', 'dead', 'dropped', 'closed'];
    const negVal = unique.find(v => negWords.includes(v)) || unique[0];
    const encoded = vals.map(v => v === negVal ? 1 : 0);

    let totalCorr = 0;
    for (const nc of numericCols) {
      const pairs = [];
      for (let i = 0; i < rows.length; i++) {
        const nv = parseFloat(rows[i][nc]);
        if (!isNaN(nv)) pairs.push([encoded[i], nv]);
      }
      if (pairs.length < 10) continue;
      try {
        const corr = Math.abs(sampleCorrelation(pairs.map(p => p[0]), pairs.map(p => p[1])));
        if (!isNaN(corr)) totalCorr += corr;
      } catch (e) { /* skip */ }
    }

    if (totalCorr > bestTotalCorr) {
      bestTotalCorr = totalCorr;
      bestCol = bc;
    }
  }

  return bestCol || binaryCols[0];
}

/**
 * Compute correlation-based polarity for each numeric column.
 * Instead of guessing from column names, compute correlation with the outcome column.
 * Positive correlation with negative outcome = bad column (high = bad).
 * Negative correlation with negative outcome = good column (high = good).
 */
export function computePolarity(rows, headers, outcomeCol) {
  if (!outcomeCol) return {};

  // Encode outcome: negative outcome = 1
  const outcomeVals = rows.map(r => String(r[outcomeCol] || '').toLowerCase());
  const unique = [...new Set(outcomeVals)].sort();
  const negWords = ['canceled', 'churned', 'inactive', 'lost', 'false', 'no', '0', 'dead', 'dropped', 'closed', 'true'];
  // For 'delinquent', 'true' means bad
  const lc = outcomeCol.toLowerCase();
  const isDelinquentStyle = ['delinquent', 'overdue', 'failed', 'fraud'].some(k => lc.includes(k));
  const negVal = isDelinquentStyle
    ? unique.find(v => ['true', 'yes', '1'].includes(v)) || unique[0]
    : unique.find(v => negWords.includes(v)) || unique[0];
  const encoded = outcomeVals.map(v => v === negVal ? 1 : 0);

  const numericCols = headers.filter(h => {
    if (h === outcomeCol) return false;
    const vals = rows.map(r => parseFloat(r[h])).filter(v => !isNaN(v));
    return vals.length > rows.length * 0.5;
  });

  const polarities = {};

  for (const col of numericCols) {
    const pairs = [];
    for (let i = 0; i < rows.length; i++) {
      const nv = parseFloat(rows[i][col]);
      if (!isNaN(nv)) pairs.push({ outcome: encoded[i], value: nv });
    }
    if (pairs.length < 10) continue;

    try {
      const corr = sampleCorrelation(
        pairs.map(p => p.outcome),
        pairs.map(p => p.value)
      );
      if (isNaN(corr)) continue;

      // Positive correlation with bad outcome = high is bad = polarity -1
      // Negative correlation with bad outcome = high is good = polarity +1
      polarities[col] = {
        polarity: corr > 0.05 ? -1 : corr < -0.05 ? 1 : 0,
        correlation: Math.round(corr * 1000) / 1000,
        strength: Math.abs(corr) > 0.3 ? 'strong' : Math.abs(corr) > 0.1 ? 'moderate' : 'weak'
      };
    } catch (e) { /* skip */ }
  }

  return polarities;
}

/**
 * Detect compound signals — pairs of columns that are more predictive together
 * than either alone.
 */
export function detectCompounds(rows, headers, outcomeCol, polarities) {
  if (!outcomeCol || !polarities) return [];

  // Get columns with at least moderate correlation
  const significantCols = Object.entries(polarities)
    .filter(([col, p]) => Math.abs(p.correlation) > 0.08)
    .sort((a, b) => Math.abs(b[1].correlation) - Math.abs(a[1].correlation))
    .slice(0, 10) // top 10 most correlated
    .map(([col]) => col);

  if (significantCols.length < 2) return [];

  // Encode outcome
  const outcomeVals = rows.map(r => String(r[outcomeCol] || '').toLowerCase());
  const unique = [...new Set(outcomeVals)].sort();
  const negWords = ['canceled', 'churned', 'inactive', 'lost', 'false', 'no', '0', 'dead', 'dropped', 'closed', 'true'];
  const lc = outcomeCol.toLowerCase();
  const isDelinquentStyle = ['delinquent', 'overdue', 'failed', 'fraud'].some(k => lc.includes(k));
  const negVal = isDelinquentStyle
    ? unique.find(v => ['true', 'yes', '1'].includes(v)) || unique[0]
    : unique.find(v => negWords.includes(v)) || unique[0];
  const outcomes = outcomeVals.map(v => v === negVal ? 1 : 0);
  const baseRate = mean(outcomes);

  const compounds = [];

  // Check all pairs
  for (let i = 0; i < significantCols.length; i++) {
    for (let j = i + 1; j < significantCols.length; j++) {
      const colA = significantCols[i], colB = significantCols[j];
      const pA = polarities[colA], pB = polarities[colB];

      // Get column values
      const valsA = rows.map(r => parseFloat(r[colA]));
      const valsB = rows.map(r => parseFloat(r[colB]));
      const validA = valsA.filter(v => !isNaN(v));
      const validB = valsB.filter(v => !isNaN(v));
      if (validA.length < 10 || validB.length < 10) continue;

      // Determine "bad" direction for each column
      const medA = quantile(validA.sort((a, b) => a - b), 0.5);
      const medB = quantile(validB.sort((a, b) => a - b), 0.5);
      const badHighA = pA.polarity === -1;
      const badHighB = pB.polarity === -1;

      // Count outcome rate when BOTH columns are in bad direction
      let bothBadCount = 0, bothBadOutcome = 0;
      let eitherBadCount = 0, eitherBadOutcome = 0;

      for (let k = 0; k < rows.length; k++) {
        const a = valsA[k], b = valsB[k];
        if (isNaN(a) || isNaN(b)) continue;
        const aBad = badHighA ? a > medA : a < medA;
        const bBad = badHighB ? b > medB : b < medB;

        if (aBad && bBad) { bothBadCount++; bothBadOutcome += outcomes[k]; }
        if (aBad || bBad) { eitherBadCount++; eitherBadOutcome += outcomes[k]; }
      }

      if (bothBadCount < 5) continue;

      const bothRate = bothBadOutcome / bothBadCount;
      const eitherRate = eitherBadCount > 0 ? eitherBadOutcome / eitherBadCount : baseRate;
      const lift = bothRate / (baseRate || 0.01);

      // Only flag if the compound is significantly worse than individual signals
      if (lift > 1.5 && bothRate > eitherRate * 1.2) {
        const cleanA = colA.replace(/^metadata[_.]/, '').replace(/_/g, ' ');
        const cleanB = colB.replace(/^metadata[_.]/, '').replace(/_/g, ' ');
        compounds.push({
          columns: [colA, colB],
          label: `${badHighA ? 'high' : 'low'} ${cleanA} + ${badHighB ? 'high' : 'low'} ${cleanB}`,
          affectedCount: bothBadCount,
          affectedPct: Math.round(bothBadCount / rows.length * 100),
          outcomeRate: Math.round(bothRate * 100),
          baseRate: Math.round(baseRate * 100),
          lift: Math.round(lift * 10) / 10,
          insight: `When ${badHighA ? 'high' : 'low'} ${cleanA} combines with ${badHighB ? 'high' : 'low'} ${cleanB}, the negative outcome rate is ${Math.round(bothRate * 100)}% — ${lift.toFixed(1)}x the base rate of ${Math.round(baseRate * 100)}%.`
        });
      }
    }
  }

  return compounds.sort((a, b) => b.lift - a.lift).slice(0, 5);
}

/**
 * Full intelligence pass — outcome detection, polarity computation, compound detection.
 * Call after durag() to enrich the results.
 */
export function enrich(duragResult) {
  const { rows, headers } = duragResult;

  const outcomeCol = detectOutcome(rows, headers);
  const polarities = outcomeCol ? computePolarity(rows, headers, outcomeCol) : {};
  const compounds = outcomeCol ? detectCompounds(rows, headers, outcomeCol, polarities) : [];

  // Compute feature importance ranking
  const featureImportance = Object.entries(polarities)
    .map(([col, p]) => ({
      column: col.replace(/^metadata[_.]/, '').replace(/_/g, ' '),
      rawColumn: col,
      polarity: p.polarity,
      correlation: p.correlation,
      strength: p.strength,
      direction: p.polarity === 1 ? 'high = good' : p.polarity === -1 ? 'high = bad' : 'neutral'
    }))
    .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

  return {
    ...duragResult,
    intelligence: {
      outcomeCol,
      outcomeColClean: outcomeCol ? outcomeCol.replace(/^metadata[_.]/, '').replace(/_/g, ' ') : null,
      polarities,
      featureImportance,
      compounds,
      summary: buildSummary(outcomeCol, featureImportance, compounds, rows)
    }
  };
}

function buildSummary(outcomeCol, features, compounds, rows) {
  if (!outcomeCol) return 'No outcome column detected. Polarity inferred from column names only.';

  const cleanOutcome = outcomeCol.replace(/^metadata[_.]/, '').replace(/_/g, ' ');
  const topDrivers = features.filter(f => f.strength !== 'weak').slice(0, 3);
  const lines = [];

  lines.push(`Outcome column: "${cleanOutcome}". All polarities computed from correlation with this column.`);

  if (topDrivers.length > 0) {
    lines.push(`Top drivers: ${topDrivers.map(f => `${f.column} (${f.direction}, r=${f.correlation})`).join(', ')}.`);
  }

  if (compounds.length > 0) {
    lines.push(`Compound signals found: ${compounds.map(c => c.label + ' (' + c.lift + 'x lift)').join('; ')}.`);
  }

  return lines.join(' ');
}
