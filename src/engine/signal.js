/**
 * Pattern detection.
 * Learn the profile of a target group, then find records outside that group
 * that match the same profile.
 *
 * Works for any boolean split — churn detection, upsell targeting,
 * loyalty identification, fraud flagging, or any custom outcome.
 */

/**
 * Find records that match the profile of a target group but aren't in it yet.
 *
 * @param {object[]} rows - All rows
 * @param {string[]} numericCols - Numeric column names
 * @param {string} outcomeCol - The column to split on (e.g., 'delinquent', 'converted', 'vip')
 * @param {string} targetValue - The value that defines the target group (e.g., 'true', 'churned', 'yes')
 * @param {object} opts - Options
 * @param {number} opts.threshold - Match threshold (0-1, default 0.7)
 * @returns {object} { matching, targetProfile, baseProfile, signals, message }
 */
export function findPattern(rows, numericCols, outcomeCol, targetValue, opts = {}) {
  const threshold = opts.threshold || 0.7;

  // Split into target and base groups
  const targetRows = rows.filter(r => String(r[outcomeCol] || '').toLowerCase() === String(targetValue).toLowerCase());
  const baseRows = rows.filter(r => String(r[outcomeCol] || '').toLowerCase() !== String(targetValue).toLowerCase());

  if (targetRows.length === 0) return { matching: [], matchCount: 0, targetCount: 0, baseCount: baseRows.length, targetProfile: {}, baseProfile: {}, signals: [], message: 'No records found with the target value.' };
  if (baseRows.length === 0) return { matching: [], matchCount: 0, targetCount: targetRows.length, baseCount: 0, targetProfile: {}, baseProfile: {}, signals: [], message: 'All records have the target value.' };

  // Build profiles: average of each numeric column for target vs base
  const targetProfile = {};
  const baseProfile = {};
  const globalProfile = {};
  const colStats = {};

  for (const col of numericCols) {
    if (col === outcomeCol) continue;

    const targetVals = targetRows.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
    const baseVals = baseRows.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
    const allVals = rows.map(r => parseFloat(r[col])).filter(v => !isNaN(v));

    if (targetVals.length < 3 || baseVals.length < 3) continue;

    const targetAvg = targetVals.reduce((a, b) => a + b, 0) / targetVals.length;
    const baseAvg = baseVals.reduce((a, b) => a + b, 0) / baseVals.length;
    const globalAvg = allVals.reduce((a, b) => a + b, 0) / allVals.length;
    const globalStd = Math.sqrt(allVals.reduce((s, v) => s + Math.pow(v - globalAvg, 2), 0) / allVals.length) || 1;
    const mn = Math.min(...allVals);
    const mx = Math.max(...allVals);
    const range = mx - mn || 1;

    const separation = Math.abs(targetAvg - baseAvg) / globalStd;

    targetProfile[col] = { avg: Math.round(targetAvg * 10) / 10 };
    baseProfile[col] = { avg: Math.round(baseAvg * 10) / 10 };
    globalProfile[col] = { avg: Math.round(globalAvg * 10) / 10 };
    colStats[col] = { targetAvg, baseAvg, globalAvg, globalStd, mn, mx, range, separation };
  }

  // Rank columns by separation
  const rankedCols = Object.entries(colStats)
    .filter(([, s]) => s.separation > 0.2)
    .sort((a, b) => b[1].separation - a[1].separation);

  if (rankedCols.length === 0) return { matching: [], matchCount: 0, targetCount: targetRows.length, baseCount: baseRows.length, targetProfile, baseProfile, globalProfile, signals: [], message: 'No columns significantly distinguish the target group from the rest.' };

  const topCols = rankedCols.slice(0, 8);

  // Score each base record on similarity to target profile
  const scored = baseRows.map(row => {
    let similarity = 0;
    let maxSim = 0;
    const reasons = [];

    for (const [col, stats] of topCols) {
      const val = parseFloat(row[col]);
      if (isNaN(val)) continue;

      const distToTarget = Math.abs(val - stats.targetAvg) / stats.range;
      const distToBase = Math.abs(val - stats.baseAvg) / stats.range;

      const colSim = distToBase / (distToTarget + distToBase + 0.001);
      const weight = stats.separation;

      similarity += colSim * weight;
      maxSim += weight;

      if (colSim > 0.6) {
        const clean = col.replace(/^metadata[_.]/, '').replace(/_/g, ' ');
        const direction = stats.targetAvg > stats.baseAvg ? 'high' : 'low';
        reasons.push(`${direction} ${clean} (${Math.round(val)} — target avg: ${Math.round(stats.targetAvg)}, base avg: ${Math.round(stats.baseAvg)})`);
      }
    }

    const score = maxSim > 0 ? similarity / maxSim : 0;
    return { row, score, reasons: reasons.slice(0, 4) };
  });

  scored.sort((a, b) => b.score - a.score);

  // Find matches above threshold
  let matching = scored.filter(s => s.score >= threshold);

  // Soft fallback if no one passes hard threshold
  if (matching.length === 0 && scored.length > 0 && scored[0].score > 0.4) {
    const softThreshold = scored[0].score * 0.9;
    const softResults = scored.filter(s => s.score >= softThreshold);
    if (softResults.length <= rows.length * 0.1) {
      matching = softResults;
    }
  }

  // Build signal descriptions
  const signals = topCols.map(([col, stats]) => {
    const clean = col.replace(/^metadata[_.]/, '').replace(/_/g, ' ');
    const direction = stats.targetAvg > stats.baseAvg ? 'higher' : 'lower';
    return {
      column: clean,
      rawColumn: col,
      separation: Math.round(stats.separation * 100) / 100,
      targetAvg: Math.round(stats.targetAvg * 10) / 10,
      baseAvg: Math.round(stats.baseAvg * 10) / 10,
      insight: `${clean} is ${direction} in target group (${Math.round(stats.targetAvg)} vs ${Math.round(stats.baseAvg)}) — ${stats.separation.toFixed(1)} std devs apart`,
    };
  });

  return {
    matching: matching.map(s => ({
      ...s.row,
      _matchScore: Math.round(s.score * 100),
      _matchReasons: s.reasons,
    })),
    matchCount: matching.length,
    targetCount: targetRows.length,
    baseCount: baseRows.length,
    totalRows: rows.length,
    targetProfile,
    baseProfile,
    globalProfile,
    signals,
    threshold,
    message: matching.length > 0
      ? `${matching.length} records match the profile of the ${targetRows.length} target records but aren't in the target group yet.`
      : `No records closely match the target profile. The ${targetRows.length} target records may not follow a distinct pattern.`,
  };
}
