import { parseCellAddr } from './cellRefs.js';

export function cloneWorkbook(wb) {
  return JSON.parse(JSON.stringify(wb));
}

export function getSheetUsedBounds(sheet) {
  let maxR = 0;
  let maxC = 0;
  Object.keys(sheet.cells).forEach((addr) => {
    const p = parseCellAddr(addr);
    const cell = sheet.cells[addr];
    if (p && cell && (cell.raw !== '' || cell.bg || cell.bold || cell.italic)) {
      if (p.r > maxR) maxR = p.r;
      if (p.c > maxC) maxC = p.c;
    }
  });
  return {
    maxR,
    maxC
  };
}
