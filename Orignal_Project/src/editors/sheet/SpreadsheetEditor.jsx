import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SvgIcon } from '../../components/SvgIcon.jsx';
import { ChartSvg } from './ChartSvg.jsx';
import {
  SHEET_COLS,
  SHEET_ROWS,
  colToLetter,
  formatCellAddr,
  parseCellAddr,
  parseRangeInput,
  shiftFormulaRefs,
  shiftFormulaRowsByMap
} from './cellRefs.js';
import { formatCellDisplay, getSheetEvaluator, isFormulaError } from './formula.js';
import { cloneWorkbook } from './workbook.js';
import { URDU_MAP, isAsciiLetter } from '../../keyboard/urduMap.js';
import { uid } from '../../lib/storage.js';

export function SpreadsheetEditor({
  fileId,
  initialData,
  onContentChange,
  registerExportApi,
  gridStartEditRef,
  lang
}) {
  const [wb, setWb] = useState(() => cloneWorkbook(initialData));
  const wbRef = useRef(wb);
  wbRef.current = wb;
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [sel, setSel] = useState({
    anchor: {
      r: 0,
      c: 0
    },
    focus: {
      r: 0,
      c: 0
    }
  });
  const [editing, setEditing] = useState(null); // { r, c, value, sheetId, source }
  const edr = useRef(null); // mirrors editing so blur + Enter cannot commit twice
  const [nameBoxVal, setNameBoxVal] = useState('A1');
  const [formulaBarVal, setFormulaBarVal] = useState('');
  const [renamingSheetId, setRenamingSheetId] = useState(null);
  const [renameVal, setRenameVal] = useState('');
  const [confirmDelSheetId, setConfirmDelSheetId] = useState(null);
  const [filterInput, setFilterInput] = useState('');
  const [textColor, setTextColor] = useState('#111827');
  const [fillColor, setFillColor] = useState('#fef08a');
  const gridRef = useRef(null);
  const draggingRef = useRef(false);
  const internalClipRef = useRef(null); // { tsv, r1, c1, rows: [][] }

  useEffect(() => {
    const next = cloneWorkbook(initialData);
    wbRef.current = next;
    setWb(next);
    setUndoStack([]);
    setRedoStack([]);
    setSel({
      anchor: {
        r: 0,
        c: 0
      },
      focus: {
        r: 0,
        c: 0
      }
    });
    edr.current = null;
    setEditing(null);
  }, [fileId]);
  const activeSheet = useMemo(() => {
    return wb.sheets.find((s) => s.id === wb.activeSheetId) || wb.sheets[0];
  }, [wb]);
  const evaluator = useMemo(() => getSheetEvaluator(activeSheet.cells), [activeSheet.cells]);
  useEffect(() => {
    setFilterInput(activeSheet.filter ? activeSheet.filter.text : '');
  }, [activeSheet.id]);
  useEffect(() => {
    if (registerExportApi) {
      registerExportApi({
        getWorkbook: () => wb
      });
    }
  }, [registerExportApi, wb]);
  const selBounds = useMemo(
    () => ({
      r1: Math.min(sel.anchor.r, sel.focus.r),
      r2: Math.max(sel.anchor.r, sel.focus.r),
      c1: Math.min(sel.anchor.c, sel.focus.c),
      c2: Math.max(sel.anchor.c, sel.focus.c)
    }),
    [sel]
  );
  const activeAddr = formatCellAddr(sel.anchor.r, sel.anchor.c);
  const activeCell = activeSheet.cells[activeAddr] || {};
  useEffect(() => {
    const { r1, c1, r2, c2 } = selBounds;
    setNameBoxVal(
      r1 === r2 && c1 === c2 ? formatCellAddr(r1, c1) : formatCellAddr(r1, c1) + ':' + formatCellAddr(r2, c2)
    );
    setFormulaBarVal(activeCell.raw !== undefined ? activeCell.raw : '');
  }, [selBounds, activeCell.raw]);
  const applyWorkbookChange = useCallback(
    (mutator, recordUndo) => {
      const prev = wbRef.current;
      if (recordUndo !== false) {
        setUndoStack((u) => [...u.slice(-59), prev]);
        setRedoStack([]);
      }
      const next = cloneWorkbook(prev);
      mutator(next);
      wbRef.current = next;
      setWb(next);
      onContentChange(next);
    },
    [onContentChange]
  );
  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((u) => u.slice(0, -1));
    setRedoStack((r) => [...r, wb]);
    setWb(prev);
    onContentChange(prev);
  };
  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((r) => r.slice(0, -1));
    setUndoStack((u) => [...u, wb]);
    setWb(next);
    onContentChange(next);
  };
  const commitEdit = useCallback(
    (overrideValue) => {
      const cur = edr.current;
      if (!cur) return;
      edr.current = null;
      setEditing(null);
      const val = overrideValue !== undefined ? overrideValue : cur.value;
      const addr = formatCellAddr(cur.r, cur.c);
      applyWorkbookChange((draft) => {
        const sh = draft.sheets.find((s) => s.id === cur.sheetId);
        if (!sh) return;
        const existing = sh.cells[addr] || {};
        if (val === '' && Object.keys(existing).length <= 1) {
          delete sh.cells[addr];
        } else {
          sh.cells[addr] = Object.assign({}, existing, {
            raw: val
          });
          if (
            val === '' &&
            !existing.bold &&
            !existing.italic &&
            !existing.underline &&
            !existing.bg &&
            !existing.color &&
            !existing.align &&
            !existing.wrap &&
            !existing.numFmt
          ) {
            delete sh.cells[addr];
          }
        }
      });
    },
    [applyWorkbookChange]
  );
  const cancelEdit = useCallback(() => {
    edr.current = null;
    setEditing(null);
    if (gridRef.current) gridRef.current.focus();
  }, []);
  const startEdit = useCallback(
    (r, c, initialText, replaceAll, source) => {
      const existing = activeSheet.cells[formatCellAddr(r, c)];
      const val = replaceAll
        ? initialText || ''
        : (existing && existing.raw !== undefined ? String(existing.raw) : '') + (initialText || '');
      const nextEd = {
        r,
        c,
        value: val,
        sheetId: activeSheet.id,
        source: source || 'grid'
      };
      edr.current = nextEd;
      setEditing(nextEd);
    },
    [activeSheet]
  );
  useEffect(() => {
    if (gridStartEditRef) {
      gridStartEditRef.current = (initialChar) => {
        startEdit(sel.anchor.r, sel.anchor.c, initialChar, true);
      };
    }
    return () => {
      if (gridStartEditRef) gridStartEditRef.current = null;
    };
  }, [gridStartEditRef, sel.anchor.r, sel.anchor.c, startEdit]);
  const updateEditingVal = (val) => {
    if (!edr.current) return;
    const next = Object.assign({}, edr.current, {
      value: val
    });
    edr.current = next;
    setEditing(next);
  };
  const moveAnchor = (dr, dc, extend) => {
    setSel((prev) => {
      const base = extend ? prev.focus : prev.anchor;
      const nr = Math.max(0, Math.min(SHEET_ROWS - 1, base.r + dr));
      const nc = Math.max(0, Math.min(SHEET_COLS - 1, base.c + dc));
      if (extend)
        return {
          anchor: prev.anchor,
          focus: {
            r: nr,
            c: nc
          }
        };
      return {
        anchor: {
          r: nr,
          c: nc
        },
        focus: {
          r: nr,
          c: nc
        }
      };
    });
  };
  const clearSelectedCells = () => {
    applyWorkbookChange((draft) => {
      const sh = draft.sheets.find((s) => s.id === activeSheet.id);
      if (!sh) return;
      for (let r = selBounds.r1; r <= selBounds.r2; r++) {
        for (let c = selBounds.c1; c <= selBounds.c2; c++) {
          const addr = formatCellAddr(r, c);
          if (sh.cells[addr]) {
            sh.cells[addr] = Object.assign({}, sh.cells[addr], {
              raw: ''
            });
          }
        }
      }
    });
  };
  const updateSelectedFormat = (patchFn) => {
    applyWorkbookChange((draft) => {
      const sh = draft.sheets.find((s) => s.id === activeSheet.id);
      if (!sh) return;
      for (let r = selBounds.r1; r <= selBounds.r2; r++) {
        for (let c = selBounds.c1; c <= selBounds.c2; c++) {
          const addr = formatCellAddr(r, c);
          const cell = sh.cells[addr] || {
            raw: ''
          };
          patchFn(cell);
          sh.cells[addr] = cell;
        }
      }
    });
  };
  const adjustColWidth = (delta) => {
    applyWorkbookChange((draft) => {
      const sh = draft.sheets.find((s) => s.id === activeSheet.id);
      if (!sh) return;
      for (let c = selBounds.c1; c <= selBounds.c2; c++) {
        const cur = sh.colWidths[c] || 96;
        sh.colWidths[c] = Math.max(40, Math.min(400, cur + delta));
      }
    });
  };
  const buildClipboardData = () => {
    const rows = [];
    const tsvLines = [];
    for (let r = selBounds.r1; r <= selBounds.r2; r++) {
      const rowCells = [];
      const lineVals = [];
      for (let c = selBounds.c1; c <= selBounds.c2; c++) {
        const addr = formatCellAddr(r, c);
        const cell = activeSheet.cells[addr];
        rowCells.push(cell ? cloneWorkbook(cell) : null);
        const v = evaluator.getValue(addr);
        lineVals.push(formatCellDisplay(v, cell));
      }
      rows.push(rowCells);
      tsvLines.push(lineVals.join('\t'));
    }
    return {
      tsv: tsvLines.join('\n'),
      r1: selBounds.r1,
      c1: selBounds.c1,
      rows
    };
  };
  const onGridCopy = (e) => {
    if (edr.current || (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')))
      return;
    e.preventDefault();
    const data = buildClipboardData();
    internalClipRef.current = data;
    if (e.clipboardData) e.clipboardData.setData('text/plain', data.tsv);
  };
  const onGridCut = (e) => {
    if (edr.current || (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')))
      return;
    e.preventDefault();
    const data = buildClipboardData();
    internalClipRef.current = data;
    if (e.clipboardData) e.clipboardData.setData('text/plain', data.tsv);
    clearSelectedCells();
  };
  const onGridPaste = (e) => {
    if (edr.current || (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')))
      return;
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    const destR = sel.anchor.r;
    const destC = sel.anchor.c;
    const clip = internalClipRef.current;
    if (clip && text === clip.tsv) {
      const dr = destR - clip.r1;
      const dc = destC - clip.c1;
      applyWorkbookChange((draft) => {
        const sh = draft.sheets.find((s) => s.id === activeSheet.id);
        if (!sh) return;
        clip.rows.forEach((rowArr, ri) => {
          rowArr.forEach((cellObj, ci) => {
            const tr = destR + ri;
            const tc = destC + ci;
            if (tr >= SHEET_ROWS || tc >= SHEET_COLS) return;
            const addr = formatCellAddr(tr, tc);
            if (!cellObj) {
              delete sh.cells[addr];
            } else {
              const copy = cloneWorkbook(cellObj);
              if (copy.raw && copy.raw.startsWith('=')) {
                copy.raw = shiftFormulaRefs(copy.raw, dr, dc);
              }
              sh.cells[addr] = copy;
            }
          });
        });
      });
      return;
    }
    if (text) {
      const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
      if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
      applyWorkbookChange((draft) => {
        const sh = draft.sheets.find((s) => s.id === activeSheet.id);
        if (!sh) return;
        lines.forEach((line, ri) => {
          const cols = line.split('\t');
          cols.forEach((val, ci) => {
            const tr = destR + ri;
            const tc = destC + ci;
            if (tr >= SHEET_ROWS || tc >= SHEET_COLS) return;
            const addr = formatCellAddr(tr, tc);
            const prev = sh.cells[addr] || {};
            sh.cells[addr] = Object.assign({}, prev, {
              raw: val
            });
          });
        });
      });
    }
  };
  const onGridKeyDown = (e) => {
    if (edr.current) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) handleRedo();
      else handleUndo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      handleRedo();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveAnchor(-1, 0, e.shiftKey);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveAnchor(1, 0, e.shiftKey);
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      moveAnchor(0, -1, e.shiftKey);
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      moveAnchor(0, 1, e.shiftKey);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      moveAnchor(0, e.shiftKey ? -1 : 1, false);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      moveAnchor(e.shiftKey ? -1 : 1, 0, false);
      return;
    }
    if (e.key === 'F2') {
      e.preventDefault();
      startEdit(sel.anchor.r, sel.anchor.c, '', false);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      clearSelectedCells();
      return;
    }
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
      e.preventDefault();
      const ch = lang === 'ur' && isAsciiLetter(e.key) ? URDU_MAP[e.key] : e.key;
      startEdit(sel.anchor.r, sel.anchor.c, ch, true);
    }
  };
  const sortActiveColumn = (asc) => {
    const col = sel.anchor.c;
    applyWorkbookChange((draft) => {
      const sh = draft.sheets.find((s) => s.id === activeSheet.id);
      if (!sh) return;
      const ev = getSheetEvaluator(sh.cells);
      // Find rows below row 1 (index >= 1) that have any cell content
      let maxUsedRow = 0;
      Object.keys(sh.cells).forEach((addr) => {
        const p = parseCellAddr(addr);
        if (p && p.r > maxUsedRow && sh.cells[addr] && sh.cells[addr].raw !== '') maxUsedRow = p.r;
      });
      if (maxUsedRow < 1) return;
      const rowIndices = [];
      for (let r = 1; r <= maxUsedRow; r++) rowIndices.push(r);
      const getSortKey = (r) => {
        const addr = formatCellAddr(r, col);
        const cell = sh.cells[addr];
        if (!cell || cell.raw === '')
          return {
            empty: true,
            val: ''
          };
        const v = ev.getValue(addr);
        return {
          empty: false,
          val: v
        };
      };
      rowIndices.sort((ra, rb) => {
        const ka = getSortKey(ra);
        const kb = getSortKey(rb);
        if (ka.empty && kb.empty) return ra - rb;
        if (ka.empty) return 1;
        if (kb.empty) return -1;
        let cmp = 0;
        if (typeof ka.val === 'number' && typeof kb.val === 'number') cmp = ka.val - kb.val;
        else
          cmp = String(ka.val).localeCompare(String(kb.val), undefined, {
            numeric: true,
            sensitivity: 'base'
          });
        return asc ? cmp : -cmp;
      });
      const rowMap = {};
      rowIndices.forEach((oldR, idx) => {
        rowMap[oldR] = idx + 1;
      });
      const newCells = {};
      Object.keys(sh.cells).forEach((addr) => {
        const p = parseCellAddr(addr);
        if (!p) return;
        const cell = sh.cells[addr];
        if (p.r === 0 || p.r > maxUsedRow) {
          newCells[addr] = cell;
        } else {
          const nr = rowMap[p.r];
          const copy = cloneWorkbook(cell);
          if (copy.raw && copy.raw.startsWith('=')) {
            copy.raw = shiftFormulaRowsByMap(copy.raw, rowMap);
          }
          newCells[formatCellAddr(nr, p.c)] = copy;
        }
      });
      sh.cells = newCells;
    });
  };
  const applyFilter = (txt) => {
    setFilterInput(txt);
    applyWorkbookChange((draft) => {
      const sh = draft.sheets.find((s) => s.id === activeSheet.id);
      if (!sh) return;
      sh.filter = txt
        ? {
            col: sel.anchor.c,
            text: txt
          }
        : null;
    }, false);
  };
