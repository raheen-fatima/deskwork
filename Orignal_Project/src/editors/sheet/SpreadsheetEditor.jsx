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
  const addChart = (type) => {
    const { r1, c1, r2, c2 } = selBounds;
    const rng = formatCellAddr(r1, c1) + ':' + formatCellAddr(r2, c2);
    applyWorkbookChange((draft) => {
      draft.charts.push({
        id: 'ch_' + uid(),
        sheetId: activeSheet.id,
        type,
        range: rng,
        title: type.charAt(0).toUpperCase() + type.slice(1) + ' Chart (' + rng + ')'
      });
    });
  };
  const visibleRowFilter = useMemo(() => {
    if (!activeSheet.filter || !activeSheet.filter.text) return null;
    const fCol = activeSheet.filter.col;
    const needle = activeSheet.filter.text.toLowerCase();
    return {
      fCol,
      needle
    };
  }, [activeSheet.filter]);

  // Selection status bar metrics (Count, Sum, Average)
  const selMetrics = useMemo(() => {
    let countNonEmpty = 0;
    let numCount = 0;
    let sum = 0;
    for (let r = selBounds.r1; r <= selBounds.r2; r++) {
      for (let c = selBounds.c1; c <= selBounds.c2; c++) {
        const addr = formatCellAddr(r, c);
        const cell = activeSheet.cells[addr];
        if (cell && cell.raw !== undefined && cell.raw !== '') {
          countNonEmpty++;
          const v = evaluator.getValue(addr);
          if (typeof v === 'number' && isFinite(v)) {
            numCount++;
            sum += v;
          }
        }
      }
    }
    return {
      count: countNonEmpty,
      sum: Math.round(sum * 1e9) / 1e9,
      avg: numCount > 0 ? Math.round((sum / numCount) * 1e6) / 1e6 : null
    };
  }, [selBounds, activeSheet.cells, evaluator]);
  const sheetCharts = wb.charts.filter((ch) => ch.sheetId === activeSheet.id);
  const preventFocus = (e) => e.preventDefault();
  return (
    <div className="sheet-workspace">
      {' '}
      // Ribbon
      <div className="ribbon" role="toolbar" aria-label="Spreadsheet tools">
        <div className="ribbon-row">
          <button
            type="button"
            className="icon-btn"
            aria-label="Undo"
            disabled={undoStack.length === 0}
            onMouseDown={preventFocus}
            onClick={handleUndo}
          >
            <SvgIcon d={['M3 7v6h6', 'M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13']} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Redo"
            disabled={redoStack.length === 0}
            onMouseDown={preventFocus}
            onClick={handleRedo}
          >
            <SvgIcon d={['M21 7v6h-6', 'M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7']} />
          </button>
          <span className="r-sep" />
          <button
            type="button"
            className="icon-btn"
            aria-label="Bold"
            aria-pressed={!!activeCell.bold}
            onMouseDown={preventFocus}
            onClick={() =>
              updateSelectedFormat((c) => {
                c.bold = !activeCell.bold;
              })
            }
          >
            <strong>B</strong>
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Italic"
            aria-pressed={!!activeCell.italic}
            onMouseDown={preventFocus}
            onClick={() =>
              updateSelectedFormat((c) => {
                c.italic = !activeCell.italic;
              })
            }
          >
            <em>I</em>
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Underline"
            aria-pressed={!!activeCell.underline}
            onMouseDown={preventFocus}
            onClick={() =>
              updateSelectedFormat((c) => {
                c.underline = !activeCell.underline;
              })
            }
          >
            <span
              style={{
                textDecoration: 'underline'
              }}
            >
              U
            </span>
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Wrap text"
            aria-pressed={!!activeCell.wrap}
            onMouseDown={preventFocus}
            onClick={() =>
              updateSelectedFormat((c) => {
                c.wrap = !activeCell.wrap;
              })
            }
          >
            Wrap
          </button>
          <span className="r-sep" />
          <label className="color-btn-wrap" title="Text colour">
            <span
              style={{
                fontSize: '11px',
                marginRight: '2px'
              }}
            >
              A
            </span>
            <input
              type="color"
              className="color-input-hidden"
              aria-label="Cell text colour"
              value={activeCell.color || textColor}
              onChange={(e) => {
                setTextColor(e.target.value);
                updateSelectedFormat((c) => {
                  c.color = e.target.value;
                });
              }}
            />
          </label>
          <label className="color-btn-wrap" title="Fill colour">
            <span
              style={{
                fontSize: '11px',
                marginRight: '2px'
              }}
            >
              Fill
            </span>
            <input
              type="color"
              className="color-input-hidden"
              aria-label="Cell fill colour"
              value={activeCell.bg || fillColor}
              onChange={(e) => {
                setFillColor(e.target.value);
                updateSelectedFormat((c) => {
                  c.bg = e.target.value;
                });
              }}
            />
          </label>
          <button
            type="button"
            className="icon-btn"
            aria-label="Clear fill"
            title="Clear fill"
            onMouseDown={preventFocus}
            onClick={() =>
              updateSelectedFormat((c) => {
                delete c.bg;
              })
            }
          >
            ∅
          </button>
          <span className="r-sep" />
          <button
            type="button"
            className="icon-btn"
            aria-label="Align left"
            aria-pressed={activeCell.align === 'left'}
            onMouseDown={preventFocus}
            onClick={() =>
              updateSelectedFormat((c) => {
                c.align = 'left';
              })
            }
          >
            L
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Align center"
            aria-pressed={activeCell.align === 'center'}
            onMouseDown={preventFocus}
            onClick={() =>
              updateSelectedFormat((c) => {
                c.align = 'center';
              })
            }
          >
            C
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Align right"
            aria-pressed={activeCell.align === 'right'}
            onMouseDown={preventFocus}
            onClick={() =>
              updateSelectedFormat((c) => {
                c.align = 'right';
              })
            }
          >
            R
          </button>
          <span className="r-sep" />
          <select
            className="r-select"
            aria-label="Number format"
            value={activeCell.numFmt || 'general'}
            onChange={(e) =>
              updateSelectedFormat((c) => {
                c.numFmt = e.target.value;
              })
            }
          >
            <option value="general">General</option>
            <option value="number">Number</option>
            <option value="currency">Currency</option>
            <option value="percent">Percent</option>
            <option value="date">Date</option>
          </select>
          <button
            type="button"
            className="icon-btn"
            aria-label="Increase decimals"
            title="Increase decimals"
            onMouseDown={preventFocus}
            onClick={() =>
              updateSelectedFormat((c) => {
                c.decimals = Math.min(10, (typeof c.decimals === 'number' ? c.decimals : 2) + 1);
              })
            }
          >
            .0+
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Decrease decimals"
            title="Decrease decimals"
            onMouseDown={preventFocus}
            onClick={() =>
              updateSelectedFormat((c) => {
                c.decimals = Math.max(0, (typeof c.decimals === 'number' ? c.decimals : 2) - 1);
              })
            }
          >
            .0−
          </button>
        </div>
        <div className="ribbon-row">
          <button
            type="button"
            className="icon-btn"
            aria-label="Narrower column"
            onMouseDown={preventFocus}
            onClick={() => adjustColWidth(-16)}
          >
            Col −
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Wider column"
            onMouseDown={preventFocus}
            onClick={() => adjustColWidth(16)}
          >
            Col +
          </button>
          <span className="r-sep" />
          <button
            type="button"
            className="icon-btn"
            aria-label="Sort A to Z"
            onMouseDown={preventFocus}
            onClick={() => sortActiveColumn(true)}
          >
            Sort A–Z
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Sort Z to A"
            onMouseDown={preventFocus}
            onClick={() => sortActiveColumn(false)}
          >
            Sort Z–A
          </button>
          <span className="r-sep" />
          <input
            type="text"
            className="subbar-input"
            style={{
              width: '130px',
              minWidth: '100px',
              height: '24px'
            }}
            placeholder={'Filter col ' + colToLetter(sel.anchor.c) + '…'}
            aria-label="Filter active column"
            value={filterInput}
            onChange={(e) => applyFilter(e.target.value)}
          />
          <button
            type="button"
            className="icon-btn"
            aria-label="Clear filter"
            disabled={!activeSheet.filter}
            onClick={() => applyFilter('')}
          >
            Clear
          </button>
          <span className="r-sep" />
          <span
            style={{
              fontSize: '11.5px',
              color: 'var(--text-muted)',
              marginRight: '2px'
            }}
          >
            Chart:
          </span>
          {['column', 'bar', 'line', 'pie', 'area'].map((t) => (
            <button
              key={t}
              type="button"
              className="icon-btn"
              onMouseDown={preventFocus}
              onClick={() => addChart(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>{' '}
      // Formula Bar
      <div className="formula-bar">
        <input
          type="text"
          className="name-box"
          aria-label="Name box"
          data-skip-urdu="true"
          value={nameBoxVal}
          onChange={(e) => setNameBoxVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const parsed = parseRangeInput(nameBoxVal);
              if (parsed) {
                setSel({
                  anchor: {
                    r: parsed.r1,
                    c: parsed.c1
                  },
                  focus: {
                    r: parsed.r2,
                    c: parsed.c2
                  }
                });
                if (gridRef.current) gridRef.current.focus();
              }
            }
          }}
        />
        <span className="fx-label">fx</span>
        <input
          type="text"
          className="formula-input"
          aria-label="Formula bar"
          data-urdu-letters-only="true"
          value={editing ? editing.value : formulaBarVal}
          onFocus={() => {
            if (!edr.current) startEdit(sel.anchor.r, sel.anchor.c, '', false, 'bar');
          }}
          onChange={(e) => {
            const val = e.target.value;
            setFormulaBarVal(val);
            if (!edr.current) startEdit(sel.anchor.r, sel.anchor.c, val, true, 'bar');
            else updateEditingVal(val);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitEdit(e.currentTarget.value);
              moveAnchor(1, 0, false);
              if (gridRef.current) gridRef.current.focus();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancelEdit();
            }
          }}
          onBlur={() => {
            if (edr.current) commitEdit();
          }}
        />
      </div>{' '}
      // Spreadsheet Grid
      <div
        ref={gridRef}
        className="sheet-grid-wrap"
        tabIndex={0}
        data-sheet-grid="true"
        role="grid"
        aria-label="Spreadsheet grid"
        onKeyDown={onGridKeyDown}
        onCopy={onGridCopy}
        onCut={onGridCut}
        onPaste={onGridPaste}
        onMouseUp={() => {
          draggingRef.current = false;
        }}
      >
        <table className="sheet-table">
          <colgroup>
            <col
              style={{
                width: '44px'
              }}
            />
            {Array.from(
              {
                length: SHEET_COLS
              },
              (_, c) => (
                <col
                  key={c}
                  style={{
                    width: (activeSheet.colWidths[c] || 96) + 'px'
                  }}
                />
              )
            )}
          </colgroup>
          <thead>
            <tr>
              <th className="sheet-corner" />
              {Array.from(
                {
                  length: SHEET_COLS
                },
                (_, c) => {
                  const inC = c >= selBounds.c1 && c <= selBounds.c2;
                  return (
                    <th
                      key={c}
                      className={'sheet-col-hdr' + (inC ? ' sel-hdr' : '')}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setSel({
                          anchor: {
                            r: 0,
                            c
                          },
                          focus: {
                            r: SHEET_ROWS - 1,
                            c
                          }
                        });
                        if (gridRef.current) gridRef.current.focus();
                      }}
                    >
                      {colToLetter(c)}
                    </th>
                  );
                }
              )}
            </tr>
          </thead>
          <tbody>
            {Array.from(
              {
                length: SHEET_ROWS
              },
              (_, r) => {
                if (visibleRowFilter && r > 0) {
                  const fv = evaluator.getValue(formatCellAddr(r, visibleRowFilter.fCol));
                  const fCell = activeSheet.cells[formatCellAddr(r, visibleRowFilter.fCol)];
                  const disp = formatCellDisplay(fv, fCell).toLowerCase();
                  if (!disp.includes(visibleRowFilter.needle)) return null;
                }
                const inR = r >= selBounds.r1 && r <= selBounds.r2;
                return (
                  <tr key={r}>
                    <th
                      className={'sheet-row-hdr' + (inR ? ' sel-hdr' : '')}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setSel({
                          anchor: {
                            r,
                            c: 0
                          },
                          focus: {
                            r,
                            c: SHEET_COLS - 1
                          }
                        });
                        if (gridRef.current) gridRef.current.focus();
                      }}
                    >
                      {r + 1}
                    </th>
                    {Array.from(
                      {
                        length: SHEET_COLS
                      },
                      (_, c) => {
                        const addr = formatCellAddr(r, c);
                        const cell = activeSheet.cells[addr];
                        const isEditingHere =
                          editing && editing.r === r && editing.c === c && editing.sheetId === activeSheet.id;
                        const isAnchor = sel.anchor.r === r && sel.anchor.c === c;
                        const inSel = inR && c >= selBounds.c1 && c <= selBounds.c2;
                        const rawVal = cell ? cell.raw : '';
                        const evalVal = rawVal !== '' ? evaluator.getValue(addr) : '';
                        const disp = rawVal !== '' ? formatCellDisplay(evalVal, cell) : '';
                        const defaultAlign =
                          typeof evalVal === 'number' && !isFormulaError(evalVal) ? 'right' : 'left';
                        const style = {
                          fontWeight: cell && cell.bold ? 700 : undefined,
                          fontStyle: cell && cell.italic ? 'italic' : undefined,
                          textDecoration: cell && cell.underline ? 'underline' : undefined,
                          color: isFormulaError(evalVal)
                            ? 'var(--danger)'
                            : cell && cell.color
                              ? cell.color
                              : undefined,
                          backgroundColor: cell && cell.bg ? cell.bg : undefined,
                          textAlign: (cell && cell.align) || defaultAlign
                        };
                        return (
                          <td
                            key={c}
                            className={
                              'sheet-cell' +
                              (cell && cell.wrap ? ' wrap' : '') +
                              (inSel ? ' in-sel' : '') +
                              (isAnchor ? ' active-cell' : '')
                            }
                            style={style}
                            onMouseDown={(e) => {
                              if (isEditingHere) return;
                              if (edr.current) commitEdit();
                              if (gridRef.current) gridRef.current.focus();
                              if (e.shiftKey) {
                                setSel((prev) => ({
                                  anchor: prev.anchor,
                                  focus: {
                                    r,
                                    c
                                  }
                                }));
                              } else {
                                draggingRef.current = true;
                                setSel({
                                  anchor: {
                                    r,
                                    c
                                  },
                                  focus: {
                                    r,
                                    c
                                  }
                                });
                              }
                            }}
                            onMouseEnter={() => {
                              if (draggingRef.current) {
                                setSel((prev) => ({
                                  anchor: prev.anchor,
                                  focus: {
                                    r,
                                    c
                                  }
                                }));
                              }
                            }}
                            onDoubleClick={() => startEdit(r, c, '', false)}
                          >
                            {isEditingHere && editing.source !== 'bar' ? (
                              <input
                                type="text"
                                autoFocus
                                className="sheet-cell-editor"
                                data-urdu-letters-only="true"
                                value={editing.value}
                                onChange={(e) => updateEditingVal(e.target.value)}
                                onKeyDown={(e) => {
                                  e.stopPropagation();
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    commitEdit(e.currentTarget.value);
                                    moveAnchor(e.shiftKey ? -1 : 1, 0, false);
                                    if (gridRef.current) gridRef.current.focus();
                                  } else if (e.key === 'Tab') {
                                    e.preventDefault();
                                    commitEdit(e.currentTarget.value);
                                    moveAnchor(0, e.shiftKey ? -1 : 1, false);
                                    if (gridRef.current) gridRef.current.focus();
                                  } else if (e.key === 'Escape') {
                                    e.preventDefault();
                                    cancelEdit();
                                  }
                                }}
                                onBlur={() => {
                                  if (edr.current) commitEdit();
                                }}
                              />
                            ) : (
                              disp
                            )}
                          </td>
                        );
                      }
                    )}
                  </tr>
                );
              }
            )}
          </tbody>
        </table>
      </div>
      {
        // Charts Dock
        sheetCharts.length > 0 ? (
          <div className="charts-panel">
            {sheetCharts.map((ch) => (
              <div key={ch.id} className="chart-card">
                <div className="chart-head">
                  <input
                    type="text"
                    className="chart-title-input"
                    aria-label="Chart title"
                    value={ch.title}
                    onChange={(e) => {
                      const v = e.target.value;
                      applyWorkbookChange((draft) => {
                        const found = draft.charts.find((x) => x.id === ch.id);
                        if (found) found.title = v;
                      });
                    }}
                  />
                  <button
                    type="button"
                    className="btn danger"
                    style={{
                      height: '22px',
                      padding: '0 7px',
                      fontSize: '11px'
                    }}
                    onClick={() =>
                      applyWorkbookChange((draft) => {
                        draft.charts = draft.charts.filter((x) => x.id !== ch.id);
                      })
                    }
                  >
                    Remove
                  </button>
                </div>
                <ChartSvg chart={ch} sheet={activeSheet} />
              </div>
            ))}
          </div>
        ) : null
      }{' '}
      // Sheet Tabs
      <div className="sheet-tabs-bar" role="tablist" aria-label="Worksheets">
        {wb.sheets.map((sh) => {
          const isActive = sh.id === activeSheet.id;
          const isRenaming = renamingSheetId === sh.id;
          return (
            <div
              key={sh.id}
              className={'sheet-tab' + (isActive ? ' active' : '')}
              role="tab"
              aria-selected={isActive}
              onClick={() => {
                if (!isActive) {
                  setConfirmDelSheetId(null);
                  applyWorkbookChange((draft) => {
                    draft.activeSheetId = sh.id;
                  }, false);
                }
              }}
              onDoubleClick={() => {
                setRenamingSheetId(sh.id);
                setRenameVal(sh.name);
              }}
            >
              {isRenaming ? (
                <input
                  type="text"
                  autoFocus
                  className="sheet-tab-rename"
                  value={renameVal}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setRenameVal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const nm = renameVal.trim() || sh.name;
                      setRenamingSheetId(null);
                      applyWorkbookChange((draft) => {
                        const found = draft.sheets.find((x) => x.id === sh.id);
                        if (found) found.name = nm;
                      });
                    } else if (e.key === 'Escape') {
                      setRenamingSheetId(null);
                    }
                  }}
                  onBlur={() => {
                    const nm = renameVal.trim() || sh.name;
                    setRenamingSheetId(null);
                    applyWorkbookChange((draft) => {
                      const found = draft.sheets.find((x) => x.id === sh.id);
                      if (found) found.name = nm;
                    });
                  }}
                />
              ) : (
                <span>{sh.name}</span>
              )}
              {wb.sheets.length > 1 ? (
                confirmDelSheetId === sh.id ? (
                  <button
                    type="button"
                    className="icon-btn"
                    style={{
                      height: '18px',
                      fontSize: '10px',
                      color: 'var(--danger)',
                      padding: '0 4px'
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDelSheetId(null);
                      applyWorkbookChange((draft) => {
                        draft.sheets = draft.sheets.filter((x) => x.id !== sh.id);
                        draft.charts = draft.charts.filter((c) => c.sheetId !== sh.id);
                        if (draft.activeSheetId === sh.id) draft.activeSheetId = draft.sheets[0].id;
                      });
                    }}
                  >
                    Confirm?
                  </button>
                ) : (
                  <button
                    type="button"
                    className="icon-btn"
                    style={{
                      height: '18px',
                      minWidth: '16px',
                      padding: '0 2px',
                      fontSize: '12px'
                    }}
                    aria-label={'Delete sheet ' + sh.name}
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDelSheetId(sh.id);
                    }}
                  >
                    ×
                  </button>
                )
              ) : null}
            </div>
          );
        })}
        <button
          type="button"
          className="icon-btn"
          aria-label="Add sheet"
          onClick={() => {
            const newId = 's_' + uid();
            let n = wb.sheets.length + 1;
            while (wb.sheets.some((s) => s.name === 'Sheet' + n)) n++;
            applyWorkbookChange((draft) => {
              draft.sheets.push({
                id: newId,
                name: 'Sheet' + n,
                cells: {},
                colWidths: {},
                filter: null
              });
              draft.activeSheetId = newId;
            });
          }}
        >
          + Sheet
        </button>
      </div>{' '}
      // Status Bar
      <div className="status-bar">
        <span>
          {'Cell ' +
            activeAddr +
            (activeSheet.filter ? ' · Filtered col ' + colToLetter(activeSheet.filter.col) : '')}
        </span>
        <span>
          {'Count: ' +
            selMetrics.count +
            (selMetrics.avg !== null ? ' · Sum: ' + selMetrics.sum + ' · Average: ' + selMetrics.avg : '')}
        </span>
      </div>
    </div>
  );
}
