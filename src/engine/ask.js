/**
 * durag ask() — polarity-based question answering
 * No static intent map. Reads column names, infers polarity, answers any question.
 */

// Polarity: is high good (+1) or bad (-1)?
const GOOD_HIGH = ['revenue','mrr','spend','value','amount','balance','income','login','active','session','visit','engagement','nps','satisfaction','score','rating','product','feature','order','referr','recommend','volunteer','loyalty','retention','conversion','growth','profit','credit_score','tenure','enrolled','member','team','integration','classes','attended'];
const BAD_HIGH = ['churn','cancel','leave','delinquent','overdue','failed','failure','complaint','ticket','support_call','refund','return','dispute','fraud','flag','suspicious','overdraft','crisis','emergency','risk','last_contact','last_touch','last_activity','days_since','last_login','last_order','incident','barrier','debt','loss','bounce','abandon'];

function getPolarity(colName) {
  const lc = colName.toLowerCase().replace(/[_.-]/g, ' ');
  for (const pat of BAD_HIGH) if (lc.includes(pat.replace(/_/g, ' '))) return -1;
  for (const pat of GOOD_HIGH) if (lc.includes(pat.replace(/_/g, ' '))) return 1;
  return 0;
}

// Question sentiment
const POS_WORDS = ['best','top','highest','most','biggest','strongest','happiest','loyal','engaged','healthy','valuable','active','satisfied','growing','ready','opportunity','advocates','promoters','vip','champion','whale'];
const NEG_WORDS = ['worst','bottom','lowest','least','weakest','unhappy','angry','frustrated','risk','churn','cancel','leave','lose','inactive','dormant','zombie','quiet','silent','dead','struggling','crisis','fraud','suspicious','weird','anomaly','declining','dropping','failing','bad','poor','low','problem','issue','concern','danger','threat','need help','needs help','help','at risk','about to leave','disengaged','lapsed','stale','cold'];

function questionSentiment(q) {
  const lc = q.toLowerCase();
  let pos = 0, neg = 0;
  for (const w of POS_WORDS) if (lc.includes(w)) pos++;
  for (const w of NEG_WORDS) if (lc.includes(w)) neg++;
  if (neg > pos) return -1;
  if (pos > neg) return 1;
  return 0;
}

// Column relevance to question
function columnRelevance(colName, question) {
  const lc = colName.toLowerCase().replace(/[_.-]/g, ' ');
  const words = question.toLowerCase().replace(/[?!.,;:'"]/g, '').split(/\s+/).filter(w => w.length > 2);
  let score = 0;
  for (const w of words) {
    if (lc.includes(w)) score += 2;
    if (w === 'churn' && (lc.includes('login') || lc.includes('cancel') || lc.includes('active') || lc.includes('engagement') || lc.includes('last'))) score += 1;
    if (w === 'upsell' && (lc.includes('nps') || lc.includes('product') || lc.includes('plan') || lc.includes('feature'))) score += 1;
    if ((w === 'happy' || w === 'satisfied') && (lc.includes('nps') || lc.includes('satisfaction') || lc.includes('score'))) score += 1;
    if ((w === 'unhappy' || w === 'frustrated') && (lc.includes('nps') || lc.includes('ticket') || lc.includes('complaint') || lc.includes('support'))) score += 1;
    if ((w === 'inactive' || w === 'dormant' || w === 'quiet' || w === 'disengaged' || w === 'engaged') && (lc.includes('login') || lc.includes('active') || lc.includes('visit') || lc.includes('last') || lc.includes('engagement') || lc.includes('session'))) score += 1;
    if ((w === 'new' || w === 'recent') && (lc.includes('tenure') || lc.includes('enrolled') || lc.includes('created') || lc.includes('signup') || lc.includes('since'))) score += 1;
    if ((w === 'fraud' || w === 'suspicious') && (lc.includes('fraud') || lc.includes('flag') || lc.includes('overdraft') || lc.includes('dispute'))) score += 1;
    if ((w === 'struggling' || w === 'help' || w === 'crisis') && (lc.includes('crisis') || lc.includes('support') || lc.includes('ticket') || lc.includes('needs') || lc.includes('barrier'))) score += 1;
    if ((w === 'value' || w === 'revenue' || w === 'money' || w === 'worst' || w === 'best') && (lc.includes('mrr') || lc.includes('revenue') || lc.includes('spend') || lc.includes('amount') || lc.includes('income') || lc.includes('balance'))) score += 1;
  }
  return score;
}

/**
 * Ask durag a question about the data.
 *
 * @param {string} question - Natural language question
 * @param {object} analysisResult - Output from durag() pipeline
 * @returns {object} { question, members, count, pct, confidence, insight, reasons, mrrExposed, suggestedAction }
 */
export function ask(question, analysisResult) {
  const { rows, headers, embedding, numericCols, mrrCol, nameCol } = analysisResult;
  const q = question.toLowerCase().trim();
  const sentiment = questionSentiment(q);

  // Build scoring plan from the data itself
  const plan = [];
  for (const col of (numericCols || [])) {
    const polarity = getPolarity(col);
    const relevance = columnRelevance(col, q);
    if (polarity === 0 && relevance === 0) continue;

    let wantHigh;
    if (sentiment === 1) wantHigh = polarity >= 0;
    else if (sentiment === -1) wantHigh = polarity <= 0;
    else wantHigh = polarity > 0;

    // Only include if the question actually relates to this column
    if (relevance === 0 && sentiment === 0) continue;
    const weight = Math.max(1, relevance + Math.abs(polarity));
    plan.push({ col, wantHigh, weight, polarity, relevance });
  }

  // Fallback: column name matching
  if (plan.length === 0) {
    const words = q.split(/\s+/).filter(w => w.length > 2);
    for (const col of (numericCols || [])) {
      const lc = col.toLowerCase().replace(/[_.-]/g, ' ');
      if (words.some(w => lc.includes(w))) {
        const wantsHigh = POS_WORDS.some(w => q.includes(w));
        plan.push({ col, wantHigh: wantsHigh, weight: 2, polarity: 0, relevance: 1 });
      }
    }
  }

  if (plan.length === 0) {
    const colNames = (numericCols || []).slice(0, 5).map(c => c.replace(/^metadata[_.]/, '').replace(/_/g, ' ')).join(', ');
    return { question: q, count: 0, pct: 0, insight: `No columns in this dataset clearly relate to "${q}". The data has: ${colNames}${(numericCols || []).length > 5 ? '...' : ''}.`, members: [], memberScores: [], reasons: [], suggestedAction: '', confidence: 0, mrrExposed: 0 };
  }

  // Pre-compute column stats
  const colStats = {};
  for (const { col } of plan) {
    const vals = rows.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
    const mn = Math.min(...vals), mx = Math.max(...vals), rng = mx - mn || 1;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    colStats[col] = { mn, mx, rng, avg };
  }

  // Score every row
  const scored = rows.map(row => {
    let score = 0, maxP = 0;
    const reasons = [];
    for (const { col, wantHigh, weight } of plan) {
      const val = parseFloat(row[col]);
      if (isNaN(val)) continue;
      const s = colStats[col];
      const norm = (val - s.mn) / s.rng;
      maxP += weight;
      const cn = col.replace(/^metadata[_.]/, '').replace(/_/g, ' ');
      if (wantHigh) {
        score += norm * weight;
        if (val > s.avg * 1.3) reasons.push(`high ${cn} (${Math.round(val)} vs ${Math.round(s.avg)} avg)`);
      } else {
        score += (1 - norm) * weight;
        if (val < s.avg * 0.7) reasons.push(`low ${cn} (${Math.round(val)} vs ${Math.round(s.avg)} avg)`);
      }
    }
    return { row, score: maxP > 0 ? score / maxP : 0, reasons: [...new Set(reasons)].slice(0, 4) };
  });
  scored.sort((a, b) => b.score - a.score);

  // Adaptive threshold: percentile + gap detection
  const n = scored.length;
  const defaultCutoff = Math.max(5, Math.min(Math.floor(n * 0.15), 300));

  // Look for the biggest score drop in the top 25% — that's the natural cliff
  let bestGapIdx = defaultCutoff;
  let bestGapSize = 0;
  const searchEnd = Math.min(Math.floor(n * 0.25), 500);
  for (let i = 1; i < searchEnd; i++) {
    const gap = scored[i - 1].score - scored[i].score;
    // Only consider gaps after at least 5 results and if the gap is significant
    if (i >= 5 && gap > bestGapSize && gap > 0.03) {
      bestGapSize = gap;
      bestGapIdx = i;
    }
  }

  // Use the cliff if it's a clear drop (>5% gap), otherwise use percentile
  // But never return fewer than 2% of the dataset
  const minResults = Math.max(5, Math.floor(n * 0.02));
  const cliffCutoff = bestGapSize > 0.05 ? Math.max(bestGapIdx, minResults) : defaultCutoff;
  const members = scored.slice(0, cliffCutoff).filter(s => s.score > 0.15);

  const allReasons = {};
  for (const m of members) for (const r of m.reasons) allReasons[r] = (allReasons[r] || 0) + 1;
  const topReasons = Object.entries(allReasons).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([r, c]) => `${r} (${c}/${members.length})`);

  const avgScore = members.length > 0 ? members.reduce((s, m) => s + m.score, 0) / members.length : 0;
  const pct = Math.round(members.length / rows.length * 100);
  const mrrExposed = mrrCol ? Math.round(members.reduce((s, m) => s + (parseFloat(m.row[mrrCol]) || 0), 0)) : 0;

  let insight = `${members.length} customers (${pct}%) match "${question}".`;
  if (mrrCol && mrrExposed > 0) insight += ` $${mrrExposed.toLocaleString()} revenue involved.`;
  if (topReasons.length > 0) insight += ` Primary signal: ${topReasons[0]}.`;

  const topCols = plan.sort((a, b) => b.weight - a.weight).slice(0, 2).map(p => p.col.replace(/^metadata[_.]/, '').replace(/_/g, ' '));
  let suggestedAction;
  if (sentiment === -1) suggestedAction = `investigate and intervene on ${topCols[0] || 'key metrics'} — these customers need attention`;
  else if (sentiment === 1) suggestedAction = `strengthen relationships with this group — they drive outsized ${topCols[0] || 'value'}`;
  else suggestedAction = `review these ${members.length} customers by ${topCols.join(' and ') || 'their distinguishing metrics'}`;

  return {
    question: q,
    members: members.map(m => m.row),
    memberScores: members.map(m => ({ score: Math.round(m.score * 100), reasons: m.reasons })),
    count: members.length,
    total: rows.length,
    pct,
    confidence: Math.round(avgScore * 100),
    reasons: topReasons,
    insight,
    mrrExposed,
    suggestedAction,
  };
}
