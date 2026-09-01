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

export async function renderSheetToCanvas(wb) {
  const html2canvas = await loadExportLib('html2canvas');
  const sh = wb.sheets.find((s) => s.id === wb.activeSheetId) || wb.sheets[0];
  const ev = getSheetEvaluator(sh.cells);
  const { maxR, maxC } = getSheetUsedBounds(sh);
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-99999px';
  host.style.top = '0';
  host.style.background = '#ffffff';
  host.style.padding = '24px';
  const tbl = document.createElement('table');
  tbl.style.borderCollapse = 'collapse';
  tbl.style.fontFamily = 'Arial, sans-serif';
  tbl.style.fontSize = '12px';
  tbl.style.color = '#111827';
  tbl.style.background = '#ffffff';
  for (let r = 0; r <= maxR; r++) {
    const tr = document.createElement('tr');
    for (let c = 0; c <= maxC; c++) {
      const addr = formatCellAddr(r, c);
      const cell = sh.cells[addr];
      const td = document.createElement('td');
      td.style.border = '1px solid #d0d5dd';
      td.style.padding = '4px 8px';
      td.style.minWidth = (sh.colWidths[c] || 96) + 'px';
      td.style.maxWidth = (sh.colWidths[c] || 96) + 'px';
      td.style.whiteSpace = cell && cell.wrap ? 'pre-wrap' : 'nowrap';
      const val = cell && cell.raw !== '' ? ev.getValue(addr) : '';
      td.textContent = cell && cell.raw !== '' ? formatCellDisplay(val, cell) : '';
      if (cell && cell.bold) td.style.fontWeight = '700';
      if (cell && cell.italic) td.style.fontStyle = 'italic';
      if (cell && cell.underline) td.style.textDecoration = 'underline';
      if (cell && cell.color) td.style.color = cell.color;
      if (cell && cell.bg) td.style.backgroundColor = cell.bg;
      td.style.textAlign =
        (cell && cell.align) || (typeof val === 'number' && !isFormulaError(val) ? 'right' : 'left');
      tr.appendChild(td);
    }
    tbl.appendChild(tr);
  }
  host.appendChild(tbl);
  document.body.appendChild(host);
  try {
    const hPx = Math.max(host.scrollHeight, 100);
    let scale = Math.min(2, window.devicePixelRatio || 2);
    if (hPx * scale > 14000) scale = Math.max(0.5, 14000 / hPx);
    return await html2canvas(host, {
      scale,
      backgroundColor: '#ffffff',
      logging: false
    });
  } finally {
    document.body.removeChild(host);
  }
}

export async function exportSheetToPdf(wb, title) {
  const jspdfMod = await loadExportLib('jspdf');
  const { jsPDF } = jspdfMod;
  const canvas = await renderSheetToCanvas(wb);
  const pageW = 1056;
  const pageH = 816;
  const ratio = Math.min(pageW / canvas.width, 1);
  const sliceSrcH = Math.round(pageH / ratio);
  const pages = Math.max(1, Math.ceil(canvas.height / sliceSrcH));
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'px',
    format: [pageW, pageH],
    hotfixes: ['px_scaling']
  });
  for (let p = 0; p < pages; p++) {
    const sy = p * sliceSrcH;
    const sh = Math.min(sliceSrcH, canvas.height - sy);
    if (sh <= 0) break;
    const tmp = document.createElement('canvas');
    tmp.width = canvas.width;
    tmp.height = sh;
    const ctx = tmp.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, tmp.width, tmp.height);
    ctx.drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh);
    if (p > 0) pdf.addPage([pageW, pageH], 'landscape');
    pdf.addImage(tmp.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, canvas.width * ratio, sh * ratio);
  }
  await triggerDownload(sanitizeFilename(title, 'pdf'), pdf.output('blob'));
}

export async function exportSheetToJpg(wb, title) {
  const canvas = await renderSheetToCanvas(wb);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.92));
  await triggerDownload(sanitizeFilename(title, 'jpg'), blob);
}

export async function exportSheetToCsv(wb, title) {
  const sh = wb.sheets.find((s) => s.id === wb.activeSheetId) || wb.sheets[0];
  const ev = getSheetEvaluator(sh.cells);
  const { maxR, maxC } = getSheetUsedBounds(sh);
  const lines = [];
  for (let r = 0; r <= maxR; r++) {
    const cols = [];
    for (let c = 0; c <= maxC; c++) {
      const addr = formatCellAddr(r, c);
      const cell = sh.cells[addr];
      const disp = cell && cell.raw !== '' ? formatCellDisplay(ev.getValue(addr), cell) : '';
      const esc = /[",\n\r]/.test(disp) ? '"' + disp.replace(/"/g, '""') + '"' : disp;
      cols.push(esc);
    }
    lines.push(cols.join(','));
  }
  await triggerDownload(
    sanitizeFilename(title, 'csv'),
    '\uFEFF' + lines.join('\r\n'),
    'text/csv;charset=utf-8'
  );
}
