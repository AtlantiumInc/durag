/**
 * True signal detection.
 * Instead of scoring everyone on polarity, learn the profile of known bad outcomes
 * and find people who match that profile but haven't triggered yet.
 */

/**
 * Find true pre-churn signal: customers who look like the bad group but aren't in it yet.
 *
 * @param {object[]} rows - All customer rows
 * @param {string[]} numericCols - Numeric column names
 * @param {string} outcomeCol - The outcome column (e.g., 'delinquent')
 * @param {string} badValue - The bad value (e.g., 'true')
 * @param {object} opts - Options
 * @param {number} opts.threshold - How close to the bad profile to flag (0-1, default 0.7)
 * @returns {object} { atRisk, badProfile, globalProfile, signals }
 */
export function findPattern(rows, numericCols, outcomeCol, badValue, opts = {}) {
  const threshold = opts.threshold || 0.7;

  // Split into bad and good groups
  const badRows = rows.filter(r => String(r[outcomeCol] || '').toLowerCase() === String(badValue).toLowerCase());
  const goodRows = rows.filter(r => String(r[outcomeCol] || '').toLowerCase() !== String(badValue).toLowerCase());

  if (badRows.length === 0) return { atRisk: [], badProfile: {}, globalProfile: {}, signals: [], message: 'No bad outcomes found in the data.' };
  if (goodRows.length === 0) return { atRisk: [], badProfile: {}, globalProfile: {}, signals: [], message: 'All rows have bad outcomes.' };

  // Build profiles: average of each numeric column for bad vs good vs global
  const badProfile = {};
  const goodProfile = {};
  const globalProfile = {};
  const colStats = {};

  for (const col of numericCols) {
    if (col === outcomeCol) continue;

    const badVals = badRows.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
    const goodVals = goodRows.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
    const allVals = rows.map(r => parseFloat(r[col])).filter(v => !isNaN(v));

    if (badVals.length < 3 || goodVals.length < 3) continue;

    const badAvg = badVals.reduce((a, b) => a + b, 0) / badVals.length;
    const goodAvg = goodVals.reduce((a, b) => a + b, 0) / goodVals.length;
    const globalAvg = allVals.reduce((a, b) => a + b, 0) / allVals.length;
    const globalStd = Math.sqrt(allVals.reduce((s, v) => s + Math.pow(v - globalAvg, 2), 0) / allVals.length) || 1;
    const mn = Math.min(...allVals);
    const mx = Math.max(...allVals);
    const range = mx - mn || 1;

    // How different is bad from good on this column?
    const separation = Math.abs(badAvg - goodAvg) / globalStd;

    badProfile[col] = { avg: Math.round(badAvg * 10) / 10 };
    goodProfile[col] = { avg: Math.round(goodAvg * 10) / 10 };
    globalProfile[col] = { avg: Math.round(globalAvg * 10) / 10 };
    colStats[col] = { badAvg, goodAvg, globalAvg, globalStd, mn, mx, range, separation };
  }

  // Rank columns by separation — which columns most distinguish bad from good
  const rankedCols = Object.entries(colStats)
    .filter(([, s]) => s.separation > 0.2)
    .sort((a, b) => b[1].separation - a[1].separation);

  if (rankedCols.length === 0) return { atRisk: [], badProfile, goodProfile, globalProfile, signals: [], message: 'No columns significantly distinguish bad from good outcomes.' };

  // Use top columns to compute a similarity score to the bad profile
  const topCols = rankedCols.slice(0, 8);

  // Score each GOOD customer on how similar they are to the bad profile
  const scored = goodRows.map(row => {
    let similarity = 0;
    let maxSim = 0;
    const reasons = [];

    for (const [col, stats] of topCols) {
      const val = parseFloat(row[col]);
      if (isNaN(val)) continue;

      // How close is this value to the bad average vs the good average?
      const distToBad = Math.abs(val - stats.badAvg) / stats.range;
      const distToGood = Math.abs(val - stats.goodAvg) / stats.range;

      // Similarity: closer to bad = higher score
      const colSim = distToGood / (distToBad + distToGood + 0.001);
      const weight = stats.separation; // more separating columns matter more

      similarity += colSim * weight;
      maxSim += weight;

      if (colSim > 0.6) {
        const clean = col.replace(/^metadata[_.]/, '').replace(/_/g, ' ');
        const direction = stats.badAvg > stats.goodAvg ? 'high' : 'low';
        reasons.push(`${direction} ${clean} (${Math.round(val)} — bad avg: ${Math.round(stats.badAvg)}, good avg: ${Math.round(stats.goodAvg)})`);
      }
    }

    const score = maxSim > 0 ? similarity / maxSim : 0;
    return { row, score, reasons: reasons.slice(0, 4) };
  });

  scored.sort((a, b) => b.score - a.score);

  // Find the natural cutoff — who genuinely looks like the bad group?
  const atRisk = scored.filter(s => s.score >= threshold);

  // If no one passes the threshold, take the top few who are closest
  if (atRisk.length === 0 && scored.length > 0 && scored[0].score > 0.4) {
    // Take everyone above 90% of top score
    const softThreshold = scored[0].score * 0.9;
    const softResults = scored.filter(s => s.score >= softThreshold);
    if (softResults.length <= rows.length * 0.1) {
      atRisk.push(...softResults);
    }
  }

  // Build signal descriptions
  const signals = topCols.map(([col, stats]) => {
    const clean = col.replace(/^metadata[_.]/, '').replace(/_/g, ' ');
    const direction = stats.badAvg > stats.goodAvg ? 'higher' : 'lower';
    return {
      column: clean,
      rawColumn: col,
      separation: Math.round(stats.separation * 100) / 100,
      badAvg: Math.round(stats.badAvg * 10) / 10,
      goodAvg: Math.round(stats.goodAvg * 10) / 10,
      insight: `${clean} is ${direction} in bad outcomes (${Math.round(stats.badAvg)} vs ${Math.round(stats.goodAvg)}) — ${stats.separation.toFixed(1)} std devs apart`,
    };
  });

  return {
    atRisk: atRisk.map(s => ({
      ...s.row,
      _signalScore: Math.round(s.score * 100),
      _signalReasons: s.reasons,
    })),
    atRiskCount: atRisk.length,
    badCount: badRows.length,
    goodCount: goodRows.length,
    totalRows: rows.length,
    badProfile,
    goodProfile,
    globalProfile,
    signals,
    threshold,
    message: atRisk.length > 0
      ? `${atRisk.length} customers match the profile of the ${badRows.length} known bad outcomes but haven't triggered yet. These are your true pre-signals.`
      : `No customers closely match the bad outcome profile. The ${badRows.length} bad outcomes may be random rather than pattern-driven.`,
  };
}
