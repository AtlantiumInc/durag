import { CLUSTER_PALETTE } from './analyzer.js';

/**
 * Question → column mapping.
 * Maps natural language intent to data column patterns and scoring direction.
 */
const INTENT_MAP = [
  // Churn / risk
  { keywords: ['churn', 'cancel', 'leave', 'lose', 'at risk', 'at-risk', 'leaving', 'dropping off', 'about to leave'],
    signals: [
      { match: ['login', 'active', 'session', 'visit', 'engagement'], direction: 'low', weight: 3 },
      { match: ['last_contact', 'last_touch', 'last_activity', 'days_since'], direction: 'high', weight: 2 },
      { match: ['nps', 'satisfaction', 'score', 'rating'], direction: 'low', weight: 2 },
      { match: ['delinquent', 'overdue', 'failed', 'failure'], direction: 'high', weight: 2 },
      { match: ['cancel', 'churn', 'status'], direction: 'match', value: ['canceled', 'churned', 'inactive', 'false'], weight: 3 },
    ]},

  // Upsell / expansion
  { keywords: ['upsell', 'expand', 'upgrade', 'grow', 'expansion', 'ready to buy', 'upsell opportunity'],
    signals: [
      { match: ['nps', 'satisfaction', 'score'], direction: 'high', weight: 3 },
      { match: ['login', 'active', 'session', 'engagement'], direction: 'high', weight: 2 },
      { match: ['product', 'feature', 'integration'], direction: 'low', weight: 2 },
      { match: ['mrr', 'revenue', 'spend', 'value', 'amount'], direction: 'mid', weight: 1 },
      { match: ['plan', 'tier'], direction: 'match', value: ['starter', 'basic', 'free', 'growth'], weight: 2 },
    ]},

  // High value / VIP
  { keywords: ['best', 'top', 'vip', 'highest value', 'most valuable', 'champions', 'biggest', 'whale'],
    signals: [
      { match: ['mrr', 'revenue', 'spend', 'total_spent', 'value', 'amount', 'balance'], direction: 'high', weight: 4 },
      { match: ['product', 'feature', 'order'], direction: 'high', weight: 1 },
      { match: ['tenure', 'since', 'enrolled', 'created'], direction: 'high', weight: 1 },
    ]},

  // New / recent
  { keywords: ['new', 'recent', 'just signed up', 'onboarding', 'fresh', 'just joined'],
    signals: [
      { match: ['tenure', 'since', 'enrolled', 'created', 'signup', 'first_order'], direction: 'low', weight: 4 },
      { match: ['login', 'visit', 'order', 'activity'], direction: 'low', weight: 1 },
    ]},

  // Inactive / dormant / zombie
  { keywords: ['inactive', 'dormant', 'zombie', 'sleeping', 'ghost', 'dead', 'quiet', 'silent', 'not using'],
    signals: [
      { match: ['login', 'active', 'session', 'visit', 'engagement', 'activity'], direction: 'low', weight: 4 },
      { match: ['last_login', 'last_activity', 'last_order', 'days_since'], direction: 'high', weight: 3 },
      { match: ['cancel', 'churn', 'status'], direction: 'match', value: ['active', 'true'], weight: 1 },
    ]},

  // Happy / satisfied
  { keywords: ['happy', 'satisfied', 'love', 'loyal', 'engaged', 'advocates', 'promoters'],
    signals: [
      { match: ['nps', 'satisfaction', 'score', 'rating'], direction: 'high', weight: 4 },
      { match: ['login', 'active', 'engagement', 'visit'], direction: 'high', weight: 2 },
      { match: ['referr', 'recommend', 'referred_others'], direction: 'high', weight: 2 },
      { match: ['volunteer', 'community'], direction: 'high', weight: 1 },
    ]},

  // Unhappy / at risk sentiment
  { keywords: ['unhappy', 'angry', 'frustrated', 'complaining', 'detractors', 'low nps'],
    signals: [
      { match: ['nps', 'satisfaction', 'score', 'rating'], direction: 'low', weight: 4 },
      { match: ['support', 'ticket', 'complaint', 'call'], direction: 'high', weight: 3 },
      { match: ['refund', 'return', 'dispute'], direction: 'high', weight: 2 },
    ]},

  // Fraud / suspicious
  { keywords: ['fraud', 'suspicious', 'anomaly', 'weird', 'unusual', 'outlier', 'strange'],
    signals: [
      { match: ['fraud', 'flag', 'suspicious', 'dispute'], direction: 'high', weight: 4 },
      { match: ['overdraft', 'failure', 'failed', 'delinquent'], direction: 'high', weight: 3 },
      { match: ['transaction', 'order', 'amount'], direction: 'high', weight: 1 },
    ]},

  // Need help / struggling
  { keywords: ['struggling', 'need help', 'support heavy', 'high touch', 'crisis', 'at need'],
    signals: [
      { match: ['support', 'ticket', 'call', 'help'], direction: 'high', weight: 4 },
      { match: ['crisis', 'emergency', 'incident'], direction: 'high', weight: 3 },
      { match: ['income', 'balance', 'spend'], direction: 'low', weight: 1 },
      { match: ['needs_met', 'satisfaction'], direction: 'low', weight: 2 },
    ]},

  // Similar to a specific entity (nearest neighbor)
  { keywords: ['similar to', 'like', 'remind', 'looks like', 'same as'],
    type: 'nearest_neighbor' },
];

/**
 * Score a row against signals using available columns.
 */
function scoreRow(row, signals, numericCols, allRows) {
  let score = 0;
  let maxPossible = 0;
  const reasons = [];

  for (const signal of signals) {
    // Find matching column
    const col = numericCols.find(c => signal.match.some(m => c.toLowerCase().includes(m)));
    if (!col) continue;

    const val = parseFloat(row[col]);
    if (isNaN(val)) continue;

    // Get global stats for this column
    const allVals = allRows.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
    const min = Math.min(...allVals), max = Math.max(...allVals);
    const range = max - min || 1;
    const normalized = (val - min) / range; // 0 to 1

    const avg = allVals.reduce((a, b) => a + b, 0) / allVals.length;

    maxPossible += signal.weight;

    if (signal.direction === 'high') {
      score += normalized * signal.weight;
      if (val > avg * 1.3) reasons.push(`high ${col.replace(/^metadata[_.]/, '').replace(/_/g, ' ')} (${Math.round(val)} vs ${Math.round(avg)} avg)`);
    } else if (signal.direction === 'low') {
      score += (1 - normalized) * signal.weight;
      if (val < avg * 0.7) reasons.push(`low ${col.replace(/^metadata[_.]/, '').replace(/_/g, ' ')} (${Math.round(val)} vs ${Math.round(avg)} avg)`);
    } else if (signal.direction === 'mid') {
      // Mid-range is interesting (not too high, not too low)
      const midScore = 1 - Math.abs(normalized - 0.5) * 2;
      score += midScore * signal.weight;
    } else if (signal.direction === 'match') {
      const strVal = String(row[col] || '').toLowerCase();
      if (signal.value && signal.value.some(v => strVal.includes(v))) {
        score += signal.weight;
        reasons.push(`${col.replace(/^metadata[_.]/, '').replace(/_/g, ' ')} is ${row[col]}`);
      }
    }
  }

  // Also check non-numeric columns for 'match' signals
  for (const signal of signals) {
    if (signal.direction !== 'match') continue;
    const col = Object.keys(row).find(c => signal.match.some(m => c.toLowerCase().includes(m)));
    if (!col || numericCols.includes(col)) continue; // already handled above
    const strVal = String(row[col] || '').toLowerCase();
    if (signal.value && signal.value.some(v => strVal.includes(v))) {
      maxPossible += signal.weight;
      score += signal.weight;
      reasons.push(`${col.replace(/^metadata[_.]/, '').replace(/_/g, ' ')} is ${row[col]}`);
    }
  }

  return {
    score: maxPossible > 0 ? score / maxPossible : 0,
    reasons: [...new Set(reasons)].slice(0, 3),
  };
}

/**
 * Find the entity name in a question for nearest-neighbor queries.
 */
function extractEntity(question, rows, nameCol) {
  const q = question.toLowerCase();
  for (const row of rows) {
    const name = String(row[nameCol] || '').toLowerCase();
    if (name && name.length > 2 && q.includes(name)) return row;
  }
  return null;
}

/**
 * Ask durag a question about the data.
 *
 * @param {string} question - Natural language question
 * @param {object} analysisResult - Output from durag() pipeline
 * @returns {object} { members, count, confidence, insight, reasons, mrrExposed, suggestedAction }
 */
export function ask(question, analysisResult) {
  const { rows, headers, clusters, numericCols, mrrCol, nameCol, embedding } = analysisResult;
  const q = question.toLowerCase().trim();

  // Find matching intent
  let matchedIntent = null;
  let bestMatchCount = 0;

  for (const intent of INTENT_MAP) {
    if (intent.type === 'nearest_neighbor') {
      // Check if it's a "similar to X" query
      if (intent.keywords.some(k => q.includes(k))) {
        const entity = extractEntity(question, rows, nameCol);
        if (entity) {
          return nearestNeighborQuery(entity, analysisResult);
        }
      }
      continue;
    }

    let matchCount = 0;
    for (const kw of intent.keywords) {
      if (q.includes(kw)) matchCount++;
    }
    if (matchCount > bestMatchCount) {
      bestMatchCount = matchCount;
      matchedIntent = intent;
    }
  }

  if (!matchedIntent) {
    // Fallback: try to match column names directly
    return columnQuery(q, analysisResult);
  }

  // Score every row against the intent's signals
  const scored = rows.map((row, i) => {
    const { score, reasons } = scoreRow(row, matchedIntent.signals, numericCols || [], rows);
    return { row, index: i, score, reasons };
  });

  scored.sort((a, b) => b.score - a.score);

  // Find a natural threshold — top scoring group
  const topScore = scored[0]?.score || 0;
  const threshold = Math.max(topScore * 0.6, 0.3);
  const members = scored.filter(s => s.score >= threshold);

  // Aggregate reasons
  const allReasons = {};
  for (const m of members) {
    for (const r of m.reasons) {
      allReasons[r] = (allReasons[r] || 0) + 1;
    }
  }
  const topReasons = Object.entries(allReasons)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([reason, count]) => `${reason} (${count}/${members.length})`);

  // MRR exposure
  let mrrExposed = 0;
  if (mrrCol) {
    mrrExposed = members.reduce((s, m) => s + (parseFloat(m.row[mrrCol]) || 0), 0);
  }

  // Avg confidence
  const avgScore = members.length > 0
    ? members.reduce((s, m) => s + m.score, 0) / members.length
    : 0;

  // Generate insight
  const pct = Math.round(members.length / rows.length * 100);
  let insight = `${members.length} customers (${pct}%) match "${question}".`;
  if (mrrCol && mrrExposed > 0) {
    insight += ` $${Math.round(mrrExposed).toLocaleString()} revenue involved.`;
  }
  if (topReasons.length > 0) {
    insight += ` Primary signal: ${topReasons[0]}.`;
  }

  // Suggested action based on intent
  const intentKeyword = matchedIntent.keywords[0];
  const actions = {
    churn: 'trigger re-engagement sequence targeting the primary risk factor',
    upsell: 'create upsell tasks for account managers with specific product recommendations',
    best: 'schedule executive business reviews to strengthen these relationships',
    new: 'ensure onboarding sequence is active and monitor first-30-day engagement',
    inactive: 'send reactivation campaign and flag for CS review if no response in 7 days',
    happy: 'request referrals and case studies from this group',
    unhappy: 'prioritize support outreach and schedule recovery calls',
    fraud: 'escalate to review queue with transaction details',
    struggling: 'connect with case manager and assess resource needs',
  };
  const suggestedAction = actions[intentKeyword] || 'review these customers and determine next steps';

  return {
    question,
    members: members.map(m => m.row),
    memberScores: members.map(m => ({ id: m.row[nameCol] || m.row[headers[0]], score: Math.round(m.score * 100), reasons: m.reasons })),
    count: members.length,
    total: rows.length,
    pct,
    confidence: Math.round(avgScore * 100),
    reasons: topReasons,
    insight,
    mrrExposed: Math.round(mrrExposed),
    suggestedAction,
  };
}

/**
 * Nearest neighbor query: "who's similar to X?"
 */
function nearestNeighborQuery(targetRow, analysisResult) {
  const { rows, headers, embedding, nameCol, mrrCol } = analysisResult;
  const targetIdx = rows.indexOf(targetRow);
  if (targetIdx < 0) return { members: [], count: 0, insight: 'Customer not found.' };

  const targetEmb = embedding[targetIdx];

  // Compute distances in embedding space
  const distances = rows.map((row, i) => {
    if (i === targetIdx) return { row, index: i, dist: Infinity };
    const emb = embedding[i];
    let d = 0;
    for (let j = 0; j < targetEmb.length; j++) { const df = targetEmb[j] - emb[j]; d += df * df; }
    return { row, index: i, dist: Math.sqrt(d) };
  });

  distances.sort((a, b) => a.dist - b.dist);
  const similar = distances.slice(0, 20);

  const targetName = targetRow[nameCol] || targetRow[headers[0]];

  return {
    question: `similar to ${targetName}`,
    members: similar.map(s => s.row),
    memberScores: similar.map(s => ({ id: s.row[nameCol] || s.row[headers[0]], score: Math.round((1 - s.dist / (similar[similar.length - 1]?.dist || 1)) * 100), reasons: [`distance: ${s.dist.toFixed(2)}`] })),
    count: similar.length,
    total: rows.length,
    pct: Math.round(similar.length / rows.length * 100),
    confidence: 95,
    reasons: [`20 nearest neighbors to ${targetName} in pattern space`],
    insight: `${similar.length} customers behave most similarly to ${targetName} across all measured dimensions.`,
    mrrExposed: mrrCol ? Math.round(similar.reduce((s, m) => s + (parseFloat(m.row[mrrCol]) || 0), 0)) : 0,
    suggestedAction: `apply the same strategy used for ${targetName} to these similar customers`,
  };
}

/**
 * Fallback: match question against column names directly.
 */
function columnQuery(q, analysisResult) {
  const { rows, headers, numericCols, nameCol, mrrCol } = analysisResult;

  // Find column that matches the question
  const words = q.split(/\s+/).filter(w => w.length > 2);
  let bestCol = null, bestMatch = 0;

  for (const col of numericCols || []) {
    const cleanCol = col.toLowerCase().replace(/[_.-]/g, ' ');
    let matches = 0;
    for (const w of words) {
      if (cleanCol.includes(w)) matches++;
    }
    if (matches > bestMatch) { bestMatch = matches; bestCol = col; }
  }

  if (!bestCol) {
    return {
      question: q,
      members: [],
      count: 0,
      total: rows.length,
      pct: 0,
      confidence: 0,
      reasons: [],
      insight: `Could not find a clear match for "${q}" in the data columns. Try asking about churn, upsell, engagement, value, or a specific column name.`,
      mrrExposed: 0,
      suggestedAction: 'rephrase the question or explore the default segments',
    };
  }

  // Determine if they want high or low
  const wantsHigh = ['high', 'most', 'top', 'biggest', 'highest', 'best', 'max'].some(w => q.includes(w));
  const wantsLow = ['low', 'least', 'worst', 'smallest', 'lowest', 'min', 'no', 'zero', 'none'].some(w => q.includes(w));

  const vals = rows.map((r, i) => ({ row: r, index: i, val: parseFloat(r[bestCol]) || 0 }));
  vals.sort((a, b) => wantsLow ? a.val - b.val : b.val - a.val);

  // Top 20% or bottom 20%
  const cutoff = Math.max(10, Math.round(rows.length * 0.2));
  const members = vals.slice(0, cutoff);
  const cleanName = bestCol.replace(/^metadata[_.]/, '').replace(/_/g, ' ');

  return {
    question: q,
    members: members.map(m => m.row),
    memberScores: members.map(m => ({ id: m.row[nameCol] || m.row[headers[0]], score: Math.round(m.val), reasons: [`${cleanName}: ${m.val}`] })),
    count: members.length,
    total: rows.length,
    pct: Math.round(members.length / rows.length * 100),
    confidence: bestMatch > 1 ? 80 : 50,
    reasons: [`${wantsLow ? 'lowest' : 'highest'} ${cleanName}`],
    insight: `${members.length} customers with ${wantsLow ? 'lowest' : 'highest'} ${cleanName}. Range: ${members[0]?.val} to ${members[members.length - 1]?.val}.`,
    mrrExposed: mrrCol ? Math.round(members.reduce((s, m) => s + (parseFloat(m.row[mrrCol]) || 0), 0)) : 0,
    suggestedAction: `review these ${members.length} customers and take action based on their ${cleanName} values`,
  };
}
