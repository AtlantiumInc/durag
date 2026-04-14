export function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('CSV needs header + data');

  const parseRow = line => {
    const row = [];
    let cell = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') inQ = false;
        else cell += ch;
      } else {
        if (ch === '"') inQ = true;
        else if (ch === ',') { row.push(cell.trim()); cell = ''; }
        else cell += ch;
      }
    }
    row.push(cell.trim());
    return row;
  };

  const headers = parseRow(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = parseRow(lines[i]);
    const obj = {};
    headers.forEach((h, j) => { obj[h] = vals[j] !== undefined ? vals[j] : ''; });
    rows.push(obj);
  }
  return { headers, rows };
}
