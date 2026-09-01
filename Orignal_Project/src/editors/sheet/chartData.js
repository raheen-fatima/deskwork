import { colToLetter, formatCellAddr, parseRangeInput } from './cellRefs.js';
import { getSheetEvaluator, isFormulaError } from './formula.js';

export const CHART_COLORS = ['#7a2e6b', '#0f6e73', '#2563eb', '#d97706', '#059669', '#dc2626'];

export function extractChartData(sheet, rangeStr) {
  const rng = parseRangeInput(rangeStr);
  if (!rng)
    return {
      labels: [],
      series: []
    };
  const r1 = Math.min(rng.r1, rng.r2);
  const r2 = Math.max(rng.r1, rng.r2);
  const c1 = Math.min(rng.c1, rng.c2);
  const c2 = Math.max(rng.c1, rng.c2);
  const ev = getSheetEvaluator(sheet.cells);
  const numCols = c2 - c1 + 1;
  const numRows = r2 - r1 + 1;
  if (numRows < 1 || numCols < 1)
    return {
      labels: [],
      series: []
    };
  let startRow = r1;
  let hasHeader = false;
  if (numRows > 1) {
    const checkCol = numCols > 1 ? c1 + 1 : c1;
    const v = ev.getValue(formatCellAddr(r1, checkCol));
    if (typeof v === 'string' && v !== '' && !isFormulaError(v)) hasHeader = true;
  }
  if (hasHeader) startRow = r1 + 1;
  const labels = [];
  for (let r = startRow; r <= r2; r++) {
    if (numCols > 1) {
      const lv = ev.getValue(formatCellAddr(r, c1));
      labels.push(lv === '' ? String(r + 1) : String(lv));
    } else {
      labels.push('R' + (r + 1));
    }
  }
  const seriesStartCol = numCols > 1 ? c1 + 1 : c1;
  const series = [];
  for (let c = seriesStartCol; c <= c2; c++) {
    const name = hasHeader ? String(ev.getValue(formatCellAddr(r1, c)) || colToLetter(c)) : colToLetter(c);
    const values = [];
    for (let r = startRow; r <= r2; r++) {
      const v = ev.getValue(formatCellAddr(r, c));
      values.push(typeof v === 'number' && isFinite(v) ? v : 0);
    }
    series.push({
      name,
      values
    });
  }
  return {
    labels,
    series
  };
}
