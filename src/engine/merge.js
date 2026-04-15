import { parseCSV } from './parser.js';

/**
 * Merge multiple data sources into a unified table.
 * Left joins all sources on a key column (e.g., email).
 *
 * @param {object[]} sources - Array of { csv, prefix, key }
 *   csv: raw CSV string or { rows, headers } object
 *   prefix: string to prefix columns with (e.g., 'stripe')
 *   key: column name to join on in this source
 * @returns {object} { rows, headers, meta }
 */
export function merge(sources) {
  if (!sources || sources.length === 0) throw new Error('merge: no sources provided');
  if (sources.length === 1) {
    const parsed = typeof sources[0].csv === 'string' ? parseCSV(sources[0].csv) : sources[0].csv;
    return { rows: parsed.rows, headers: parsed.headers, meta: { sources: 1, matched: parsed.rows.length } };
  }

  // Parse all sources
  const parsed = sources.map(s => {
    const data = typeof s.csv === 'string' ? parseCSV(s.csv) : { rows: s.csv.rows || s.csv, headers: s.csv.headers || Object.keys(s.csv[0]) };
    return { ...s, rows: data.rows, headers: data.headers };
  });

  // First source is the base — build a hash map on its key
  const base = parsed[0];
  const baseKey = base.key;
  const basePrefix = base.prefix || 'source1';

  // Normalize key values for matching
  const normalizeKey = v => String(v || '').trim().toLowerCase();

  // Build the merged rows starting from base
  const keyMap = new Map(); // normalized key → merged row
  const mergedRows = [];

  for (const row of base.rows) {
    const keyVal = normalizeKey(row[baseKey]);
    if (!keyVal) continue;

    // Prefix base columns
    const merged = { _merge_key: row[baseKey] };
    for (const h of base.headers) {
      if (h === baseKey) {
        merged[baseKey] = row[h]; // keep original key unprefixed
      } else {
        merged[basePrefix + '_' + h] = row[h];
      }
    }

    keyMap.set(keyVal, merged);
    mergedRows.push(merged);
  }

  // Join each subsequent source
  let matchedCount = mergedRows.length;
  const unmatchedSources = {};

  for (let i = 1; i < parsed.length; i++) {
    const src = parsed[i];
    const srcKey = src.key;
    const srcPrefix = src.prefix || ('source' + (i + 1));
    let matched = 0;

    for (const row of src.rows) {
      const keyVal = normalizeKey(row[srcKey]);
      if (!keyVal) continue;

      const target = keyMap.get(keyVal);
      if (target) {
        // Add this source's columns to the existing merged row
        for (const h of src.headers) {
          if (h === srcKey) continue; // skip the join key (already have it)
          target[srcPrefix + '_' + h] = row[h];
        }
        matched++;
      }
      // If no match, this row is dropped (left join from base)
    }

    unmatchedSources[srcPrefix] = { total: src.rows.length, matched };
    matchedCount = Math.min(matchedCount, matched);
  }

  // Build unified headers
  const headers = [base.key]; // join key first
  for (const src of parsed) {
    const prefix = src.prefix || ('source' + (parsed.indexOf(src) + 1));
    for (const h of src.headers) {
      if (h === src.key) continue;
      const prefixed = prefix + '_' + h;
      if (!headers.includes(prefixed)) headers.push(prefixed);
    }
  }

  // Fill missing values with empty strings
  for (const row of mergedRows) {
    for (const h of headers) {
      if (row[h] === undefined) row[h] = '';
    }
  }

  return {
    rows: mergedRows,
    headers,
    meta: {
      sources: sources.length,
      baseRows: base.rows.length,
      mergedRows: mergedRows.length,
      matchDetails: unmatchedSources,
      totalColumns: headers.length,
      sourcePrefixes: parsed.map(s => s.prefix || 'source' + (parsed.indexOf(s) + 1)),
    },
  };
}
