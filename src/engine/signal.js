/**
 * Pattern detection.
 * Learn the profile of a target group, then find records outside that group
 * that match the same profile.
 *
 * Works for any boolean split — churn detection, upsell targeting,
 * loyalty identification, fraud flagging, or any custom outcome.
 *
 * Automatically encodes categorical columns as binary features
 * so patterns like "Contract = Month-to-month" are detected.
 */

/**
 * One-hot encode categorical columns into binary features.
 * "Contract" with values ["Month-to-month", "One year", "Two year"]
 * becomes three columns: Contract_Month-to-month (0/1), etc.
 */
function expandCategoricals(rows, headers, outcomeCol, maxUnique = 10) {
  const expanded = rows.map(r => ({ ...r }));
  const newCols = [];
  const skipPatterns = ['id', 'email', 'name', 'customer', 'phone', 'address'];

  for (const h of headers) {
    if (h === outcomeCol) continue;
    const lc = h.toLowerCase();
    if (skipPatterns.some(p => lc.includes(p))) continue;

    // Check if this column is categorical (not numeric)
    const vals = rows.map(r => r[h]).filter(v => v !== '' && v !== null && v !== undefined);
    const nums = vals.map(v => parseFloat(v)).filter(v => !isNaN(v));
    if (nums.length > vals.length * 0.5) continue; // already numeric, skip

    const unique = [...new Set(vals)];
    if (unique.length < 2 || unique.length > maxUnique) continue;

    // Create a binary column for each unique value
    for (const uv of unique) {
      const colName = h + '_is_' + String(uv).replace(/[^a-zA-Z0-9]/g, '_');
      newCols.push(colName);
      for (let i = 0; i < expanded.length; i++) {
        expanded[i][colName] = String(rows[i][h]) === String(uv) ? 1 : 0;
      }
    }
  }

  return { rows: expanded, newCols };
}

/**
 * Find records that match the profile of a target group but aren't in it yet.
 *
 * @param {object[]} rows - All rows
 * @param {string[]} numericCols - Numeric column names (auto-expanded with categoricals)
 * @param {string} outcomeCol - The column to split on
 * @param {string} targetValue - The value that defines the target group
 * @param {object} opts - Options
 * @param {number} opts.threshold - Match threshold (0-1, default 0.7)
 * @param {string[]} opts.allHeaders - All column headers (enables categorical encoding)
 * @returns {object} { matching, targetProfile, baseProfile, signals, message }
 */
export function findPattern(rows, numericCols, outcomeCol, targetValue, opts = {}) {
  const threshold = opts.threshold || 0.7;
  const allHeaders = opts.allHeaders || null;

  // Expand categoricals if all headers provided
  let workingRows = rows;
  let workingCols = [...numericCols];

  if (allHeaders) {
    const { rows: expanded, newCols } = expandCategoricals(rows, allHeaders, outcomeCol);
    workingRows = expanded;
    workingCols = [...numericCols, ...newCols];
  }

  // Split into target and base groups
  const targetRows = workingRows.filter(r => String(r[outcomeCol] || '').toLowerCase() === String(targetValue).toLowerCase());
  const baseRows = workingRows.filter(r => String(r[outcomeCol] || '').toLowerCase() !== String(targetValue).toLowerCase());

  if (targetRows.length === 0) return { matching: [], matchCount: 0, targetCount: 0, baseCount: baseRows.length, targetProfile: {}, baseProfile: {}, signals: [], message: 'No records found with the target value.' };
  if (baseRows.length === 0) return { matching: [], matchCount: 0, targetCount: targetRows.length, baseCount: 0, targetProfile: {}, baseProfile: {}, signals: [], message: 'All records have the target value.' };

  // Build profiles
  const targetProfile = {};
  const baseProfile = {};
  const globalProfile = {};
  const colStats = {};

  for (const col of workingCols) {
    if (col === outcomeCol) continue;

    const targetVals = targetRows.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
    const baseVals = baseRows.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
    const allVals = workingRows.map(r => parseFloat(r[col])).filter(v => !isNaN(v));

    if (targetVals.length < 3 || baseVals.length < 3) continue;

    const targetAvg = targetVals.reduce((a, b) => a + b, 0) / targetVals.length;
    const baseAvg = baseVals.reduce((a, b) => a + b, 0) / baseVals.length;
    const globalAvg = allVals.reduce((a, b) => a + b, 0) / allVals.length;
    const globalStd = Math.sqrt(allVals.reduce((s, v) => s + Math.pow(v - globalAvg, 2), 0) / allVals.length) || 1;
    const mn = Math.min(...allVals);
    const mx = Math.max(...allVals);
    const range = mx - mn || 1;

    const separation = Math.abs(targetAvg - baseAvg) / globalStd;

    targetProfile[col] = { avg: Math.round(targetAvg * 1000) / 1000 };
    baseProfile[col] = { avg: Math.round(baseAvg * 1000) / 1000 };
    globalProfile[col] = { avg: Math.round(globalAvg * 1000) / 1000 };
    colStats[col] = { targetAvg, baseAvg, globalAvg, globalStd, mn, mx, range, separation };
  }

  // Rank columns by separation
  const rankedCols = Object.entries(colStats)
    .filter(([, s]) => s.separation > 0.2)
    .sort((a, b) => b[1].separation - a[1].separation);

  if (rankedCols.length === 0) return { matching: [], matchCount: 0, targetCount: targetRows.length, baseCount: baseRows.length, targetProfile, baseProfile, globalProfile, signals: [], message: 'No columns significantly distinguish the target group from the rest.' };

  const topCols = rankedCols.slice(0, 12); // more cols now that we have categoricals

  // Score each base record
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
        // Clean up one-hot column names for display
        let clean = col.replace(/^metadata[_.]/, '').replace(/_/g, ' ');
        if (col.includes('_is_')) {
          const parts = col.split('_is_');
          clean = parts[0].replace(/_/g, ' ') + ' = ' + parts[1].replace(/_/g, ' ');
        }
        const direction = stats.targetAvg > stats.baseAvg ? 'high' : 'low';
        const pct = col.includes('_is_') ? (Math.round(stats.targetAvg * 100) + '% in target vs ' + Math.round(stats.baseAvg * 100) + '% in base') : (Math.round(val) + ' — target avg: ' + Math.round(stats.targetAvg) + ', base avg: ' + Math.round(stats.baseAvg));
        reasons.push(`${direction} ${clean} (${pct})`);
      }
    }

    const score = maxSim > 0 ? similarity / maxSim : 0;
    // Map back to original row (without one-hot columns)
    const originalRow = rows.find(r => {
      // Match by checking all original columns
      for (const h of numericCols.slice(0, 3)) {
        if (String(r[h]) !== String(row[h])) return false;
      }
      return true;
    }) || row;

    return { row: originalRow, score, reasons: reasons.slice(0, 4) };
  });

  scored.sort((a, b) => b.score - a.score);

  // Find matches above threshold
  let matching = scored.filter(s => s.score >= threshold);

  if (matching.length === 0 && scored.length > 0 && scored[0].score > 0.4) {
    const softThreshold = scored[0].score * 0.9;
    const softResults = scored.filter(s => s.score >= softThreshold);
    if (softResults.length <= rows.length * 0.1) {
      matching = softResults;
    }
  }

  // Build signal descriptions
  const signals = topCols.map(([col, stats]) => {
    let clean = col.replace(/^metadata[_.]/, '').replace(/_/g, ' ');
    if (col.includes('_is_')) {
      const parts = col.split('_is_');
      clean = parts[0].replace(/_/g, ' ') + ' = ' + parts[1].replace(/_/g, ' ');
    }
    const direction = stats.targetAvg > stats.baseAvg ? 'higher' : 'lower';
    const detail = col.includes('_is_')
      ? `${clean}: ${Math.round(stats.targetAvg * 100)}% in target vs ${Math.round(stats.baseAvg * 100)}% in base — ${stats.separation.toFixed(1)} std devs`
      : `${clean} is ${direction} in target group (${Math.round(stats.targetAvg)} vs ${Math.round(stats.baseAvg)}) — ${stats.separation.toFixed(1)} std devs apart`;

    return {
      column: clean,
      rawColumn: col,
      separation: Math.round(stats.separation * 100) / 100,
      targetAvg: Math.round(stats.targetAvg * 1000) / 1000,
      baseAvg: Math.round(stats.baseAvg * 1000) / 1000,
      insight: detail,
    };
  });

  // Build summary — one sentence for UI cards
  let summary;
  if (matching.length === 0) {
    summary = `No matches found. The ${targetRows.length} target records don't follow a pattern distinct enough to predict.`;
  } else {
    const topSignal = signals[0];
    const pct = Math.round(matching.length / baseRows.length * 100);
    let signalText = '';
    if (topSignal) {
      if (topSignal.rawColumn.includes('_is_')) {
        signalText = ` Top signal: ${topSignal.column} (${Math.round(topSignal.targetAvg * 100)}% vs ${Math.round(topSignal.baseAvg * 100)}% baseline).`;
      } else {
        const dir = topSignal.targetAvg > topSignal.baseAvg ? 'higher' : 'lower';
        const ratio = topSignal.targetAvg > topSignal.baseAvg
          ? (topSignal.targetAvg / (topSignal.baseAvg || 1)).toFixed(1)
          : (topSignal.baseAvg / (topSignal.targetAvg || 1)).toFixed(1);
        signalText = ` Top signal: ${topSignal.column} is ${ratio}x ${dir} in the target group.`;
      }
    }
    summary = `${matching.length} records (${pct}% of base) match the target pattern but haven't crossed yet.${signalText}`;
  }

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
    summary,
    message: matching.length > 0
      ? `${matching.length} records match the profile of the ${targetRows.length} target records but aren't in the target group yet.`
      : `No records closely match the target profile. The ${targetRows.length} target records may not follow a distinct pattern.`,
  };
}
