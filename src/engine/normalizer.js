export function profileColumn(values) {
  const unique = [...new Set(values)];
  if (unique.length <= 1) return { type: 'constant', unique: unique.length };
  if (unique.length === 2) return { type: 'binary', unique: 2 };
  const nums = values.map(v => parseFloat(v));
  if (nums.every(v => !isNaN(v))) {
    const sorted = [...nums].sort((a, b) => a - b), len = sorted.length;
    return {
      type: 'numeric', unique: unique.length,
      min: sorted[0], max: sorted[len - 1],
      mean: sorted.reduce((a, b) => a + b, 0) / len
    };
  }
  return { type: 'categorical', unique: unique.length, categories: unique };
}

export const normalizers = {
  minmax(v) {
    const mn = Math.min(...v), mx = Math.max(...v);
    if (mx === mn) return v.map(() => 0.5);
    return v.map(x => (x - mn) / (mx - mn));
  },
  robust(v) {
    const s = [...v].sort((a, b) => a - b);
    const med = s[Math.floor(s.length / 2)];
    const iqr = s[Math.floor(s.length * 0.75)] - s[Math.floor(s.length * 0.25)] || 1;
    return normalizers.minmax(v.map(x => Math.max(-3, Math.min(3, (x - med) / iqr))));
  },
  binary(v) {
    const pos = ['active', 'true', 'yes', '1', 'won', 'paid', 'complete'];
    return v.map(x => pos.includes(String(x).toLowerCase()) ? 1 : 0);
  },
  ordinal(v, order) {
    const mx = order.length - 1 || 1;
    return v.map(x => { const i = order.indexOf(x); return i >= 0 ? i / mx : 0.5; });
  }
};

export function chooseNormalizer(profile, col) {
  if (profile.type === 'constant') return null;
  if (profile.type === 'binary') return 'binary';
  const lc = col.toLowerCase();
  if (['plan', 'tier', 'level', 'stage', 'type'].some(k => lc.includes(k))) return 'ordinal';
  if (['id', 'email', 'name', 'description', 'source', 'card', 'token', 'key'].some(k => lc.includes(k))) return null;
  if (profile.type === 'numeric') return profile.max > profile.mean * 5 ? 'robust' : 'minmax';
  if (profile.type === 'categorical' && profile.unique <= 10) return 'ordinal';
  return null;
}

export function buildVectors(rows, headers, { features, ignore } = {}) {
  const used = [], colData = [];
  const cols = features
    ? headers.filter(h => features.some(f => h.toLowerCase().includes(f.toLowerCase())))
    : ignore
      ? headers.filter(h => !ignore.some(f => h.toLowerCase().includes(f.toLowerCase())))
      : headers;
  for (const col of cols) {
    let vals = rows.map(r => {
      const v = r[col];
      return (v === '' || v === null || v === undefined) ? -1 : v;
    });
    const profile = profileColumn(vals);
    const strategy = chooseNormalizer(profile, col);
    if (!strategy) continue;
    let normed;
    if (strategy === 'ordinal') {
      const cats = profile.categories || [...new Set(vals)].sort();
      normed = normalizers.ordinal(vals, cats);
    } else if (strategy === 'binary') {
      normed = normalizers.binary(vals);
    } else {
      normed = normalizers[strategy](vals.map(Number));
    }
    colData.push(normed);
    used.push(col);
  }
  return { vectors: rows.map((_, i) => colData.map(c => c[i])), columns: used };
}
