export const CLUSTER_PALETTE = ['#fbbf24', '#f87171', '#60a5fa', '#4ade80', '#c084fc', '#f97316', '#06b6d4', '#e879f9'];

export function findNumericCols(rows, headers) {
  return headers.filter(h => {
    const nums = rows.map(r => parseFloat(r[h])).filter(v => !isNaN(v));
    return nums.length > rows.length * 0.5;
  });
}

export function findMrrCol(headers) {
  const candidates = ['mrr', 'revenue', 'amount', 'total', 'value'];
  for (const c of candidates) {
    const found = headers.find(h => h.toLowerCase().includes(c));
    if (found) return found;
  }
  return null;
}

export function findNameCol(headers) {
  const candidates = ['name', 'company', 'customer_name', 'customer'];
  for (const c of candidates) {
    const found = headers.find(h => h.toLowerCase() === c || h.toLowerCase().includes(c));
    if (found) return found;
  }
  return headers[0];
}

export function analyzeCluster(members, allRows, numericCols, mrrCol) {
  const n = members.length;
  const stats = {};
  for (const col of numericCols) {
    const vals = members.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
    const globalVals = allRows.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    const globalAvg = globalVals.length ? globalVals.reduce((a, b) => a + b, 0) / globalVals.length : 0;
    const globalStd = Math.sqrt(globalVals.reduce((s, v) => s + Math.pow(v - globalAvg, 2), 0) / globalVals.length) || 1;
    stats[col] = { avg, globalAvg, zscore: (avg - globalAvg) / globalStd };
  }

  let bestCol = '', bestScore = 0, bestDir = '';
  for (const [col, s] of Object.entries(stats)) {
    if (Math.abs(s.zscore) > bestScore) { bestScore = Math.abs(s.zscore); bestCol = col; bestDir = s.zscore > 0 ? 'high' : 'low'; }
  }

  const cleanName = bestCol ? bestCol.replace(/^metadata[_.]/, '').replace(/_/g, ' ') : '';
  const label = bestCol ? `${bestDir} ${cleanName}` : `group ${Math.floor(Math.random() * 90 + 10)}`;
  const totalMrr = mrrCol ? members.reduce((s, r) => s + (parseFloat(r[mrrCol]) || 0), 0) : 0;
  const avgMrr = mrrCol && n ? totalMrr / n : 0;

  const loginCol = numericCols.find(c => c.toLowerCase().includes('login'));
  const contactCol = numericCols.find(c => c.toLowerCase().includes('contact') || c.toLowerCase().includes('last_touch'));
  const delinquentRate = members.filter(r => String(r.delinquent || '').toLowerCase() === 'true').length / n;
  const avgLogin = loginCol ? members.reduce((s, r) => s + (parseFloat(r[loginCol]) || 0), 0) / n : null;
  const avgContact = contactCol ? members.reduce((s, r) => s + (parseFloat(r[contactCol]) || 0), 0) / n : null;
  const globalAvgLogin = loginCol ? allRows.reduce((s, r) => s + (parseFloat(r[loginCol]) || 0), 0) / allRows.length : null;
  const globalAvgContact = contactCol ? allRows.reduce((s, r) => s + (parseFloat(r[contactCol]) || 0), 0) / allRows.length : null;
  const atRisk = (avgLogin !== null && globalAvgLogin !== null && avgLogin < globalAvgLogin * 0.5) ||
    (avgContact !== null && globalAvgContact !== null && avgContact > globalAvgContact * 1.8) ||
    (delinquentRate > 0.2);

  const insights = generateInsights(
    { label, count: n, pct: Math.round(n / allRows.length * 100), totalMrr, avgMrr, atRisk, bestCol, bestDir, bestScore, delinquentRate, stats },
    allRows, numericCols, mrrCol
  );

  return { label, count: n, pct: Math.round(n / allRows.length * 100), totalMrr, avgMrr, atRisk, bestCol, bestDir, bestScore, delinquentRate, stats, insights };
}

export function generateInsights(cluster, allRows, numericCols, mrrCol) {
  const insights = [];
  const fmt = v => v >= 1000 ? '$' + Math.round(v).toLocaleString() : Math.round(v * 10) / 10;
  const clean = col => col.replace(/^metadata[_.]/, '').replace(/_/g, ' ');

  const ranked = Object.entries(cluster.stats)
    .filter(([col]) => Math.abs(cluster.stats[col].zscore) > 0.1)
    .sort((a, b) => Math.abs(b[1].zscore) - Math.abs(a[1].zscore));

  if (ranked.length > 0) {
    const [col, s] = ranked[0];
    const ratio = s.globalAvg !== 0 ? s.avg / s.globalAvg : 0;
    const name = clean(col);
    if (ratio > 1.5) {
      insights.push(`${name} is ${ratio.toFixed(1)}x the global average — this is the strongest signal separating this group`);
    } else if (ratio > 0 && ratio < 0.5) {
      insights.push(`${name} is ${Math.round((1 - ratio) * 100)}% below average — significantly underperforming on this metric`);
    } else if (s.zscore > 0.5) {
      insights.push(`${name} trends notably higher than the rest of your base (avg ${fmt(s.avg)} vs ${fmt(s.globalAvg)} global)`);
    } else if (s.zscore < -0.5) {
      insights.push(`${name} trends notably lower than the rest of your base (avg ${fmt(s.avg)} vs ${fmt(s.globalAvg)} global)`);
    }
  }

  if (ranked.length > 1) {
    const [col, s] = ranked[1];
    const name = clean(col);
    if (s.zscore > 0) {
      insights.push(`also shows elevated ${name} (${fmt(s.avg)} avg vs ${fmt(s.globalAvg)} global) — may be correlated`);
    } else {
      insights.push(`paired with low ${name} (${fmt(s.avg)} avg vs ${fmt(s.globalAvg)} global) — a compound risk factor`);
    }
  }

  if (mrrCol && cluster.avgMrr > 0) {
    const globalAvgMrr = allRows.reduce((s, r) => s + (parseFloat(r[mrrCol]) || 0), 0) / allRows.length;
    if (cluster.avgMrr > globalAvgMrr * 2) {
      insights.push(`high-value segment — ${cluster.pct}% of customers but ${Math.round(cluster.totalMrr / allRows.reduce((s, r) => s + (parseFloat(r[mrrCol]) || 0), 0) * 100)}% of total revenue`);
    } else if (cluster.avgMrr < globalAvgMrr * 0.3) {
      insights.push(`low-revenue segment — avg $${Math.round(cluster.avgMrr)} vs $${Math.round(globalAvgMrr)} global. consider whether engagement justifies acquisition cost`);
    }
  }

  if (cluster.delinquentRate > 0.15) {
    const globalDelRate = allRows.filter(r => String(r.delinquent || '').toLowerCase() === 'true').length / allRows.length * 100 || 1;
    insights.push(`${Math.round(cluster.delinquentRate * 100)}% delinquent rate — ${(cluster.delinquentRate * 100 / globalDelRate).toFixed(1)}x the base rate. payment recovery should be prioritized`);
  }

  if (cluster.pct >= 25) {
    insights.push(`this is your largest segment at ${cluster.pct}% — any improvement here moves the needle on the whole base`);
  } else if (cluster.pct <= 8 && cluster.avgMrr > 0) {
    insights.push(`small but distinct group (${cluster.pct}%) — worth investigating individually rather than treating as a mass segment`);
  }

  return insights.slice(0, 3);
}

export function analyze(rows, headers, embedding, labels, k) {
  const numericCols = findNumericCols(rows, headers);
  const mrrCol = findMrrCol(headers);
  const nameCol = findNameCol(headers);
  const clusterData = {};

  for (let c = 0; c < k; c++) {
    const members = rows.filter((_, i) => labels[i] === c);
    clusterData[c] = analyzeCluster(members, rows, numericCols, mrrCol);
  }

  rows.forEach((r, i) => {
    r._cluster = labels[i];
    r._clusterName = clusterData[labels[i]].label;
  });

  return { clusters: clusterData, numericCols, mrrCol, nameCol };
}
