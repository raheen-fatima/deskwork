import { lsGet, lsSet, uid } from './storage.js';

export function defaultDocContent() {
  return {
    html: '<p><br></p>',
    pageSize: 'A4',
    orientation: 'portrait'
  };
}

export function defaultSheetContent() {
  const sId = 's_' + uid();
  return {
    sheets: [
      {
        id: sId,
        name: 'Sheet1',
        cells: {},
        colWidths: {},
        filter: null
      }
    ],
    activeSheetId: sId,
    charts: []
  };
}

export function loadFilesIndex() {
  try {
    const raw = lsGet('files', '[]');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

export function saveFilesIndex(arr) {
  lsSet('files', JSON.stringify(arr));
}

export function readFileVersion(id) {
  const v = parseInt(lsGet('v:' + id, '1'), 10);
  return isNaN(v) ? 1 : v;
}

export function readFilePayload(fileMeta) {
  try {
    const raw = lsGet('f:' + fileMeta.id, '');
    if (!raw) return fileMeta.type === 'doc' ? defaultDocContent() : defaultSheetContent();
    const parsed = JSON.parse(raw);
    if (fileMeta.type === 'doc') {
      return {
        html: typeof parsed.html === 'string' ? parsed.html : '<p><br></p>',
        pageSize: parsed.pageSize === 'Letter' ? 'Letter' : 'A4',
        orientation: parsed.orientation === 'landscape' ? 'landscape' : 'portrait'
      };
    }
    if (!Array.isArray(parsed.sheets) || parsed.sheets.length === 0) return defaultSheetContent();
    return {
      sheets: parsed.sheets,
      activeSheetId: parsed.activeSheetId || parsed.sheets[0].id,
      charts: Array.isArray(parsed.charts) ? parsed.charts : []
    };
  } catch (e) {
    return fileMeta.type === 'doc' ? defaultDocContent() : defaultSheetContent();
  }
}
