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
