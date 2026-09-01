import { formatCellAddr, parseCellAddr } from './cellRefs.js';

export const FORMULA_ERRORS = new Set(['#DIV/0!', '#VALUE!', '#NAME?', '#ERR!', '#CIRC!']);

export function isFormulaError(v) {
  return typeof v === 'string' && FORMULA_ERRORS.has(v);
}

export function excelTodaySerial() {
  const now = new Date();
  const utcToday = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const epoch = Date.UTC(1899, 11, 30);
  return Math.floor((utcToday - epoch) / 86400000);
}

export function serialToIsoDate(serial) {
  const epoch = Date.UTC(1899, 11, 30);
  const d = new Date(epoch + Math.round(serial) * 86400000);
  const pad = (n) => String(n).padStart(2, '0');
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
}

export function tokenizeFormula(expr) {
  const tokens = [];
  let i = 0;
  const n = expr.length;
  while (i < n) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // String literal with "" escape
    if (ch === '"') {
      i++;
      let s = '';
      let closed = false;
      while (i < n) {
        if (expr[i] === '"') {
          if (expr[i + 1] === '"') {
            s += '"';
            i += 2;
            continue;
          }
          closed = true;
          i++;
          break;
        }
        s += expr[i++];
      }
      if (!closed) throw new Error('#ERR!');
      tokens.push({
        type: 'STR',
        value: s
      });
      continue;
    }

    // Number literal
    if ((ch >= '0' && ch <= '9') || (ch === '.' && expr[i + 1] >= '0' && expr[i + 1] <= '9')) {
      const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(expr.slice(i));
      if (!m) throw new Error('#ERR!');
      tokens.push({
        type: 'NUM',
        value: parseFloat(m[0])
      });
      i += m[0].length;
      continue;
    }

    // Two-char comparison operators
    const two = expr.slice(i, i + 2);
    if (two === '<>' || two === '<=' || two === '>=') {
      tokens.push({
        type: 'OP',
        value: two
      });
      i += 2;
      continue;
    }

    // Single-char operators & punctuation
    if ('+-*/^&%=<>(),:'.includes(ch)) {
      tokens.push({
        type: ch === '(' || ch === ')' || ch === ',' || ch === ':' ? ch : 'OP',
        value: ch
      });
      i++;
      continue;
    }

    // Cell ref or Identifier ($A$1 or SUM or TRUE)
    if (ch === '$' || (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || ch === '_') {
      const m = /^\$?[A-Za-z_][A-Za-z0-9_$]*/.exec(expr.slice(i));
      if (!m) throw new Error('#ERR!');
      const raw = m[0];
      i += raw.length;
      const cell = parseCellAddr(raw);
      if (cell) {
        tokens.push({
          type: 'REF',
          value: raw,
          cell
        });
      } else if (raw.toUpperCase() === 'TRUE' || raw.toUpperCase() === 'FALSE') {
        tokens.push({
          type: 'BOOL',
          value: raw.toUpperCase() === 'TRUE'
        });
      } else {
        tokens.push({
          type: 'IDENT',
          value: raw.toUpperCase()
        });
      }
      continue;
    }
    throw new Error('#ERR!');
  }
  return tokens;
}

export function parseFormulaAst(tokens) {
  let pos = 0;
  const peek = () => tokens[pos] || null;
  const consume = () => tokens[pos++];
  function parseComparison() {
    let left = parseConcat();
    while (peek() && peek().type === 'OP' && ['=', '<>', '<', '>', '<=', '>='].includes(peek().value)) {
      const op = consume().value;
      const right = parseConcat();
      left = {
        kind: 'bin',
        op,
        left,
        right
      };
    }
    return left;
  }
  function parseConcat() {
    let left = parseAddSub();
    while (peek() && peek().type === 'OP' && peek().value === '&') {
      consume();
      left = {
        kind: 'bin',
        op: '&',
        left,
        right: parseAddSub()
      };
    }
    return left;
  }
  function parseAddSub() {
    let left = parseMulDiv();
    while (peek() && peek().type === 'OP' && (peek().value === '+' || peek().value === '-')) {
      const op = consume().value;
      left = {
        kind: 'bin',
        op,
        left,
        right: parseMulDiv()
      };
    }
    return left;
  }
  function parseMulDiv() {
    let left = parsePower();
    while (peek() && peek().type === 'OP' && (peek().value === '*' || peek().value === '/')) {
      const op = consume().value;
      left = {
        kind: 'bin',
        op,
        left,
        right: parsePower()
      };
    }
    return left;
  }
  function parsePower() {
    let left = parseUnary();
    if (peek() && peek().type === 'OP' && peek().value === '^') {
      consume();
      const right = parsePower();
      return {
        kind: 'bin',
        op: '^',
        left,
        right
      };
    }
    return left;
  }
  function parseUnary() {
    if (peek() && peek().type === 'OP' && (peek().value === '+' || peek().value === '-')) {
      const op = consume().value;
      return {
        kind: 'unary',
        op,
        arg: parseUnary()
      };
    }
    return parsePostfix();
  }
  function parsePostfix() {
    let node = parsePrimary();
    while (peek() && peek().type === 'OP' && peek().value === '%') {
      consume();
      node = {
        kind: 'percent',
        arg: node
      };
    }
    return node;
  }
  function parsePrimary() {
    const t = peek();
    if (!t) throw new Error('#ERR!');
    if (t.type === 'NUM') {
      consume();
      return {
        kind: 'lit',
        value: t.value
      };
    }
    if (t.type === 'STR') {
      consume();
      return {
        kind: 'lit',
        value: t.value
      };
    }
    if (t.type === 'BOOL') {
      consume();
      return {
        kind: 'lit',
        value: t.value
      };
    }
    if (t.type === '(') {
      consume();
      const expr = parseComparison();
      if (!peek() || peek().type !== ')') throw new Error('#ERR!');
      consume();
      return expr;
    }
    if (t.type === 'REF') {
      consume();
      if (peek() && peek().type === ':') {
        consume();
        const endTok = peek();
        if (!endTok || endTok.type !== 'REF') throw new Error('#ERR!');
        consume();
        return {
          kind: 'range',
          from: t.cell,
          to: endTok.cell
        };
      }
      return {
        kind: 'ref',
        cell: t.cell
      };
    }
    if (t.type === 'IDENT') {
      const name = consume().value;
      if (peek() && peek().type === '(') {
        consume();
        const args = [];
        if (peek() && peek().type !== ')') {
          args.push(parseComparison());
          while (peek() && peek().type === ',') {
            consume();
            args.push(parseComparison());
          }
        }
        if (!peek() || peek().type !== ')') throw new Error('#ERR!');
        consume();
        return {
          kind: 'call',
          name,
          args
        };
      }
      throw new Error('#NAME?');
    }
    throw new Error('#ERR!');
  }
  const ast = parseComparison();
  if (pos < tokens.length) throw new Error('#ERR!');
  return ast;
}

export const cellsEvalCache = new WeakMap();

export function getSheetEvaluator(cells) {
  let cached = cellsEvalCache.get(cells);
  if (cached) return cached;
  const results = new Map();
  const astCache = new Map();
  function toNum(v) {
    if (isFormulaError(v)) return v;
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v === '' || v === null || v === undefined) return 0;
    const n = Number(String(v).trim());
    return isNaN(n) ? '#VALUE!' : n;
  }
  function toBool(v) {
    if (isFormulaError(v)) return v;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (v === '' || v === null || v === undefined) return false;
    const s = String(v).trim().toUpperCase();
    if (s === 'TRUE') return true;
    if (s === 'FALSE') return false;
    return '#VALUE!';
  }
  function toStr(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return String(v);
  }
  function collectRangeValues(node, visiting) {
    const r1 = Math.min(node.from.r, node.to.r);
    const r2 = Math.max(node.from.r, node.to.r);
    const c1 = Math.min(node.from.c, node.to.c);
    const c2 = Math.max(node.from.c, node.to.c);
    const vals = [];
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        vals.push(evalCell(formatCellAddr(r, c), visiting));
      }
    }
    return vals;
  }
  function evalArgFlat(args, visiting) {
    const out = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a.kind === 'range') {
        const rv = collectRangeValues(a, visiting);
        for (let j = 0; j < rv.length; j++) out.push(rv[j]);
      } else {
        out.push(evalAst(a, visiting));
      }
    }
    return out;
  }
  function evalAst(node, visiting) {
    if (!node) return '#ERR!';
    if (node.kind === 'lit') return node.value;
    if (node.kind === 'ref') return evalCell(formatCellAddr(node.cell.r, node.cell.c), visiting);
    if (node.kind === 'range') return '#VALUE!';
    if (node.kind === 'percent') {
      const v = evalAst(node.arg, visiting);
      const n = toNum(v);
      return isFormulaError(n) ? n : n / 100;
    }
    if (node.kind === 'unary') {
      const v = evalAst(node.arg, visiting);
      const n = toNum(v);
      if (isFormulaError(n)) return n;
      return node.op === '-' ? -n : n;
    }
    if (node.kind === 'bin') {
      const lv = evalAst(node.left, visiting);
      if (isFormulaError(lv)) return lv;
      const rv = evalAst(node.right, visiting);
      if (isFormulaError(rv)) return rv;
      if (node.op === '&') return toStr(lv) + toStr(rv);
      if (['=', '<>', '<', '>', '<=', '>='].includes(node.op)) {
        let cmp = 0;
        if (typeof lv === 'number' && typeof rv === 'number') cmp = lv - rv;
        else if (typeof lv === 'boolean' && typeof rv === 'boolean') cmp = (lv ? 1 : 0) - (rv ? 1 : 0);
        else {
          const ls = toStr(lv).toLowerCase();
          const rs = toStr(rv).toLowerCase();
          cmp = ls < rs ? -1 : ls > rs ? 1 : 0;
        }
        if (node.op === '=') return cmp === 0;
        if (node.op === '<>') return cmp !== 0;
        if (node.op === '<') return cmp < 0;
        if (node.op === '>') return cmp > 0;
        if (node.op === '<=') return cmp <= 0;
        if (node.op === '>=') return cmp >= 0;
      }
      const ln = toNum(lv);
      if (isFormulaError(ln)) return ln;
      const rn = toNum(rv);
      if (isFormulaError(rn)) return rn;
      if (node.op === '+') return ln + rn;
      if (node.op === '-') return ln - rn;
      if (node.op === '*') return ln * rn;
      if (node.op === '/') return rn === 0 ? '#DIV/0!' : ln / rn;
      if (node.op === '^') {
        const res = Math.pow(ln, rn);
        return isNaN(res) || !isFinite(res) ? '#VALUE!' : res;
      }
    }
    if (node.kind === 'call') {
      const fn = node.name;
      const args = node.args;
      if (fn === 'IF') {
        if (args.length < 2 || args.length > 3) return '#ERR!';
        const cond = evalAst(args[0], visiting);
        if (isFormulaError(cond)) return cond;
        const b = toBool(cond);
        if (isFormulaError(b)) return b;
        if (b) return evalAst(args[1], visiting);
        return args.length === 3 ? evalAst(args[2], visiting) : false;
      }
      if (fn === 'TODAY') {
        if (args.length !== 0) return '#ERR!';
        return excelTodaySerial();
      }
      if (fn === 'ABS') {
        if (args.length !== 1) return '#ERR!';
        const n = toNum(evalAst(args[0], visiting));
        return isFormulaError(n) ? n : Math.abs(n);
      }
      if (fn === 'ROUND') {
        if (args.length < 1 || args.length > 2) return '#ERR!';
        const n = toNum(evalAst(args[0], visiting));
        if (isFormulaError(n)) return n;
        const d = args.length === 2 ? toNum(evalAst(args[1], visiting)) : 0;
        if (isFormulaError(d)) return d;
        const factor = Math.pow(10, Math.trunc(d));
        if (!isFinite(factor) || factor === 0) return Math.round(n);
        return (Math.sign(n) * Math.floor(Math.abs(n) * factor + 0.5 + 1e-12)) / factor;
      }
      if (fn === 'NOT') {
        if (args.length !== 1) return '#ERR!';
        const b = toBool(evalAst(args[0], visiting));
        return isFormulaError(b) ? b : !b;
      }
      if (fn === 'AND' || fn === 'OR') {
        if (args.length === 0) return '#ERR!';
        const flat = evalArgFlat(args, visiting);
        let hasBool = false;
        let acc = fn === 'AND';
        for (let i = 0; i < flat.length; i++) {
          const v = flat[i];
          if (isFormulaError(v)) return v;
          if (v === '' || v === null || v === undefined) continue;
          const b = toBool(v);
          if (isFormulaError(b)) return b;
          hasBool = true;
          if (fn === 'AND' && !b) acc = false;
          if (fn === 'OR' && b) acc = true;
        }
        return hasBool ? acc : '#VALUE!';
      }
      if (
        fn === 'SUM' ||
        fn === 'AVERAGE' ||
        fn === 'MIN' ||
        fn === 'MAX' ||
        fn === 'COUNT' ||
        fn === 'COUNTA'
      ) {
        const flat = evalArgFlat(args, visiting);
        if (fn === 'COUNTA') {
          let c = 0;
          for (let i = 0; i < flat.length; i++) {
            if (flat[i] === '#CIRC!') return '#CIRC!';
            if (flat[i] !== '' && flat[i] !== null && flat[i] !== undefined) c++;
          }
          return c;
        }
        const nums = [];
        for (let i = 0; i < flat.length; i++) {
          const v = flat[i];
          if (isFormulaError(v)) {
            if (fn === 'COUNT') {
              if (v === '#CIRC!') return '#CIRC!';
              continue;
            }
            return v;
          }
          if (typeof v === 'number') nums.push(v);
        }
        if (fn === 'COUNT') return nums.length;
        if (fn === 'SUM') return nums.reduce((a, b) => a + b, 0);
        if (fn === 'AVERAGE')
          return nums.length === 0 ? '#DIV/0!' : nums.reduce((a, b) => a + b, 0) / nums.length;
        if (fn === 'MIN') return nums.length === 0 ? 0 : Math.min.apply(null, nums);
        if (fn === 'MAX') return nums.length === 0 ? 0 : Math.max.apply(null, nums);
      }
      if (fn === 'CONCAT') {
        const flat = evalArgFlat(args, visiting);
        let s = '';
        for (let i = 0; i < flat.length; i++) {
          if (isFormulaError(flat[i])) return flat[i];
          s += toStr(flat[i]);
        }
        return s;
      }
      if (fn === 'LEN' || fn === 'UPPER' || fn === 'LOWER') {
        if (args.length !== 1) return '#ERR!';
        const v = evalAst(args[0], visiting);
        if (isFormulaError(v)) return v;
        const s = toStr(v);
        if (fn === 'LEN') return s.length;
        if (fn === 'UPPER') return s.toUpperCase();
        return s.toLowerCase();
      }
      if (fn === 'LEFT' || fn === 'RIGHT') {
        if (args.length < 1 || args.length > 2) return '#ERR!';
        const v = evalAst(args[0], visiting);
        if (isFormulaError(v)) return v;
        const s = toStr(v);
        const cnt = args.length === 2 ? toNum(evalAst(args[1], visiting)) : 1;
        if (isFormulaError(cnt)) return cnt;
        const k = Math.max(0, Math.floor(cnt));
        return fn === 'LEFT' ? s.slice(0, k) : k === 0 ? '' : s.slice(-k);
      }
      return '#NAME?';
    }
    return '#ERR!';
  }
  function evalCell(addr, visiting) {
    if (results.has(addr)) return results.get(addr);
    const cell = cells[addr];
    if (!cell || cell.raw === undefined || cell.raw === null || cell.raw === '') {
      results.set(addr, '');
      return '';
    }
    const raw = String(cell.raw);
    if (!raw.startsWith('=')) {
      const trimmed = raw.trim();
      if (trimmed !== '' && !isNaN(Number(trimmed))) {
        const num = Number(trimmed);
        results.set(addr, num);
        return num;
      }
      if (trimmed.toUpperCase() === 'TRUE') {
        results.set(addr, true);
        return true;
      }
      if (trimmed.toUpperCase() === 'FALSE') {
        results.set(addr, false);
        return false;
      }
      results.set(addr, raw);
      return raw;
    }
    if (visiting.has(addr)) {
      return '#CIRC!';
    }
    visiting.add(addr);
    let val;
    try {
      let ast = astCache.get(addr);
      if (!ast) {
        const toks = tokenizeFormula(raw.slice(1));
        ast = parseFormulaAst(toks);
        astCache.set(addr, ast);
      }
      val = evalAst(ast, visiting);
    } catch (err) {
      val = isFormulaError(err.message) ? err.message : '#ERR!';
    }
    visiting.delete(addr);
    if (val === '#CIRC!') {
      // Do not permanently cache partial non-circ if reached from outside, or cache #CIRC! directly since every cell in cycle gets #CIRC!
      results.set(addr, '#CIRC!');
      return '#CIRC!';
    }
    results.set(addr, val);
    return val;
  }
  cached = {
    getValue(addr) {
      return evalCell(addr, new Set());
    }
  };
  cellsEvalCache.set(cells, cached);
  return cached;
}

export function isTodayFormula(raw) {
  return typeof raw === 'string' && /^\s*=\s*TODAY\s*\(\s*\)\s*$/i.test(raw);
}

export function formatCellDisplay(val, cell) {
  if (val === '' || val === null || val === undefined) return '';
  if (isFormulaError(val)) return val;
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val !== 'number') return String(val);
  const raw = cell && cell.raw ? cell.raw : '';
  let fmt = (cell && cell.numFmt) || 'general';
  if (fmt === 'general' && isTodayFormula(raw)) fmt = 'date';
  const dec = cell && typeof cell.decimals === 'number' ? cell.decimals : 2;
  if (fmt === 'date') return serialToIsoDate(val);
  if (fmt === 'number')
    return val.toLocaleString(undefined, {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec
    });
  if (fmt === 'currency')
    return (
      '$' +
      val.toLocaleString(undefined, {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec
      })
    );
  if (fmt === 'percent')
    return (
      (val * 100).toLocaleString(undefined, {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec
      }) + '%'
    );
  return String(Math.round(val * 1e12) / 1e12);
}
