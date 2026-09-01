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
