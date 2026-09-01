export const SHEET_ROWS = 100;

export const SHEET_COLS = 26;

export function colToLetter(c) {
  return String.fromCharCode(65 + c);
}

export function letterToCol(str) {
  if (!str || str.length !== 1) return -1;
  const code = str.toUpperCase().charCodeAt(0) - 65;
  return code >= 0 && code < SHEET_COLS ? code : -1;
}

export function parseCellAddr(str) {
  const m = /^(\$?)([A-Za-z])(\$?)(\d+)$/.exec(str.trim());
  if (!m) return null;
  const col = letterToCol(m[2]);
  const row = parseInt(m[4], 10) - 1;
  if (col < 0 || row < 0 || row >= SHEET_ROWS) return null;
  return {
    r: row,
    c: col,
    absC: m[1] === '$',
    absR: m[3] === '$'
  };
}

export function formatCellAddr(r, c) {
  return colToLetter(c) + (r + 1);
}

export function parseRangeInput(str) {
  const s = (str || '').trim().toUpperCase();
  if (s.includes(':')) {
    const parts = s.split(':');
    if (parts.length !== 2) return null;
    const a = parseCellAddr(parts[0]);
    const b = parseCellAddr(parts[1]);
    if (!a || !b) return null;
    return {
      r1: a.r,
      c1: a.c,
      r2: b.r,
      c2: b.c
    };
  }
  const a = parseCellAddr(s);
  if (!a) return null;
  return {
    r1: a.r,
    c1: a.c,
    r2: a.r,
    c2: a.c
  };
}

export function shiftFormulaRefs(raw, dr, dc) {
  if (!raw || !raw.startsWith('=')) return raw;
  // Replace cell refs outside string literals
  let out = '';
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === '"') {
      let j = i + 1;
      while (j < raw.length) {
        if (raw[j] === '"' && raw[j + 1] === '"') {
          j += 2;
          continue;
        }
        if (raw[j] === '"') {
          j++;
          break;
        }
        j++;
      }
      out += raw.slice(i, j);
      i = j;
      continue;
    }
    const sub = raw.slice(i);
    const m = /^(\$?)([A-Za-z])(\$?)(\d+)(?![A-Za-z0-9_])/.exec(sub);
    if (m && (i === 0 || !/[A-Za-z0-9_]/.test(raw[i - 1]))) {
      const absC = m[1] === '$';
      const col = letterToCol(m[2]);
      const absR = m[3] === '$';
      const row = parseInt(m[4], 10) - 1;
      if (col >= 0 && row >= 0 && row < SHEET_ROWS) {
        const nc = absC ? col : col + dc;
        const nr = absR ? row : row + dr;
        if (nc < 0 || nc >= SHEET_COLS || nr < 0 || nr >= SHEET_ROWS) {
          out += '#ERR!';
        } else {
          out += (absC ? '$' : '') + colToLetter(nc) + (absR ? '$' : '') + (nr + 1);
        }
        i += m[0].length;
        continue;
      }
    }
    out += raw[i];
    i++;
  }
  return out;
}

export function shiftFormulaRowsByMap(raw, rowMap) {
  if (!raw || !raw.startsWith('=')) return raw;
  let out = '';
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === '"') {
      let j = i + 1;
      while (j < raw.length) {
        if (raw[j] === '"' && raw[j + 1] === '"') {
          j += 2;
          continue;
        }
        if (raw[j] === '"') {
          j++;
          break;
        }
        j++;
      }
      out += raw.slice(i, j);
      i = j;
      continue;
    }
    const sub = raw.slice(i);
    const m = /^(\$?)([A-Za-z])(\$?)(\d+)(?![A-Za-z0-9_])/.exec(sub);
    if (m && (i === 0 || !/[A-Za-z0-9_]/.test(raw[i - 1]))) {
      const absC = m[1] === '$';
      const col = letterToCol(m[2]);
      const absR = m[3] === '$';
      const row = parseInt(m[4], 10) - 1;
      if (col >= 0 && row >= 0 && row < SHEET_ROWS) {
        const nr = !absR && Object.prototype.hasOwnProperty.call(rowMap, row) ? rowMap[row] : row;
        out += (absC ? '$' : '') + colToLetter(col) + (absR ? '$' : '') + (nr + 1);
        i += m[0].length;
        continue;
      }
    }
    out += raw[i];
    i++;
  }
  return out;
}
