import { formatCellAddr, parseCellAddr } from '../editors/sheet/cellRefs.js';
import {
  formatCellDisplay,
  getSheetEvaluator,
  isFormulaError,
  isTodayFormula
} from '../editors/sheet/formula.js';
import { getSheetUsedBounds } from '../editors/sheet/workbook.js';
import { loadExportLib } from './loadLibs.js';
import { cssColorToHex, sanitizeFilename, triggerDownload } from './utils.js';

export async function exportSheetToXlsx(wb, title, onNotice) {
  const ExcelJS = await loadExportLib('exceljs');
  const book = new ExcelJS.Workbook();
  const usedNames = new Set();
  wb.sheets.forEach((sh) => {
    let base = (sh.name || 'Sheet').replace(/[\\/?*[\]:]/g, '_').trim() || 'Sheet';
    base = base.slice(0, 31);
    let unique = base;
    let idx = 2;
    while (usedNames.has(unique.toLowerCase())) {
      const suffix = '_' + idx++;
      unique = base.slice(0, 31 - suffix.length) + suffix;
    }
    usedNames.add(unique.toLowerCase());
    const ws = book.addWorksheet(unique);
    const ev = getSheetEvaluator(sh.cells);
    const { maxR, maxC } = getSheetUsedBounds(sh);
    for (let c = 0; c <= maxC; c++) {
      const px = sh.colWidths[c] || 96;
      ws.getColumn(c + 1).width = Math.max(6, Math.round(px / 7));
    }
    Object.keys(sh.cells).forEach((addr) => {
      const p = parseCellAddr(addr);
      if (!p) return;
      const cell = sh.cells[addr];
      if (!cell) return;
      const xCell = ws.getCell(p.r + 1, p.c + 1);
      const raw = cell.raw !== undefined ? String(cell.raw) : '';
      const evalVal = raw !== '' ? ev.getValue(addr) : '';
      if (raw.startsWith('=')) {
        const res = isFormulaError(evalVal)
          ? {
              error: evalVal
            }
          : evalVal;
        xCell.value = {
          formula: raw.slice(1),
          result: res
        };
      } else if (typeof evalVal === 'number' || typeof evalVal === 'boolean') {
        xCell.value = evalVal;
      } else {
        xCell.value = raw;
      }
      let fmt = cell.numFmt || 'general';
      if (fmt === 'general' && isTodayFormula(raw)) fmt = 'date';
      const dec = typeof cell.decimals === 'number' ? cell.decimals : 2;
      const zeros = dec > 0 ? '.' + '0'.repeat(dec) : '';
      if (fmt === 'number') xCell.numFmt = '#,##0' + zeros;
      else if (fmt === 'currency') xCell.numFmt = '$#,##0' + zeros;
      else if (fmt === 'percent') xCell.numFmt = '0' + zeros + '%';
      else if (fmt === 'date') xCell.numFmt = 'yyyy-mm-dd';
      const font = {};
      if (cell.bold) font.bold = true;
      if (cell.italic) font.italic = true;
      if (cell.underline) font.underline = true;
      const colorHex = cssColorToHex(cell.color);
      if (colorHex)
        font.color = {
          argb: 'FF' + colorHex
        };
      if (Object.keys(font).length) xCell.font = font;
      const bgHex = cssColorToHex(cell.bg);
      if (bgHex)
        xCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: {
            argb: 'FF' + bgHex
          }
        };
      const align = {};
      if (cell.align) align.horizontal = cell.align;
      if (cell.wrap) align.wrapText = true;
      if (Object.keys(align).length) xCell.alignment = align;
    });
  });
  const buf = await book.xlsx.writeBuffer();
  await triggerDownload(
    sanitizeFilename(title, 'xlsx'),
    new Uint8Array(buf),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  if (wb.charts && wb.charts.length > 0 && onNotice) {
    onNotice('XLSX exported. Note: charts are not exported in XLSX.', false);
  }
}

