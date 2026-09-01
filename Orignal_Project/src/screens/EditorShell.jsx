import { useCallback, useEffect, useRef, useState } from 'react';
import { SpreadsheetEditor } from '../editors/sheet/SpreadsheetEditor.jsx';
import { WordEditor } from '../editors/word/WordEditor.jsx';
import { exportDocToDocx, exportDocToHtml, exportDocToJpg, exportDocToPdf } from '../export/docExport.js';
import {
  exportSheetToCsv,
  exportSheetToJpg,
  exportSheetToPdf,
  exportSheetToXlsx
} from '../export/sheetExport.js';
import { useAutosave } from '../hooks/useAutosave.js';
import { readFilePayload } from '../lib/files.js';

export function EditorShell({
  fileMeta,
  onBack,
  onIndexTouch,
  theme,
  onToggleTheme,
  lang,
  onToggleLang,
  kbOpen,
  onToggleKb,
  gridStartEditRef,
  docRestoreFocusRef
}) {
  const [title, setTitle] = useState(fileMeta.title || 'Untitled');
  const [initialData] = useState(() => readFilePayload(fileMeta));
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState('');
  const [notice, setNotice] = useState(null); // { text, isError }

  const latestTitleRef = useRef(title);
  latestTitleRef.current = title;
  const latestContentRef = useRef(initialData);
  const exportApiRef = useRef(null);
  const exportWrapRef = useRef(null);
  useEffect(() => {
    setTitle(fileMeta.title || 'Untitled');
    latestContentRef.current = readFilePayload(fileMeta);
    setNotice(null);
  }, [fileMeta.id]);
  const getSnapshot = useCallback(
    () => ({
      title: latestTitleRef.current.trim() || 'Untitled',
      content: latestContentRef.current
    }),
    []
  );
  const { status, markDirty, flush } = useAutosave(fileMeta.id, getSnapshot, (savedTitle, updatedAt) => {
    onIndexTouch(fileMeta.id, savedTitle, updatedAt);
  });
  useEffect(() => {
    const onDocClick = (e) => {
      if (exportMenuOpen && exportWrapRef.current && !exportWrapRef.current.contains(e.target)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [exportMenuOpen]);
  const handleContentChange = useCallback(
    (nextContent) => {
      latestContentRef.current = nextContent;
      markDirty();
    },
    [markDirty]
  );
  const handleTitleChange = (e) => {
    setTitle(e.target.value);
    latestTitleRef.current = e.target.value;
    markDirty();
  };
  const handleBack = () => {
    flush(false);
    onBack();
  };
  const showNotice = useCallback((text, isError) => {
    setNotice({
      text,
      isError: !!isError
    });
  }, []);
  const runExport = async (fmt) => {
    setExportMenuOpen(false);
    setExportBusy(fmt);
    setNotice(null);
    try {
      const api = exportApiRef.current;
      if (!api) throw new Error('Editor not ready');
      if (fileMeta.type === 'doc') {
        const pageEl = api.getPageElement();
        const dims = api.getDimensions();
        const cfg = api.getPageConfig();
        if (fmt === 'docx') await exportDocToDocx(pageEl, cfg, title);
        else if (fmt === 'pdf') await exportDocToPdf(pageEl, dims, cfg, title);
        else if (fmt === 'jpg') await exportDocToJpg(pageEl, title);
        else if (fmt === 'html') await exportDocToHtml(pageEl, dims, title);
      } else {
        const wb = api.getWorkbook();
        if (fmt === 'xlsx') await exportSheetToXlsx(wb, title, showNotice);
        else if (fmt === 'pdf') await exportSheetToPdf(wb, title);
        else if (fmt === 'jpg') await exportSheetToJpg(wb, title);
        else if (fmt === 'csv') await exportSheetToCsv(wb, title);
      }
    } catch (err) {
      showNotice('Export failed: ' + (err && err.message ? err.message : 'Unknown error'), true);
    } finally {
      setExportBusy('');
    }
  };
  const badgeLabel = {
    saved: 'All changes saved',
    saving: 'Saving…',
    unsaved: 'Unsaved changes (click to save)',
    error: 'Save failed (click to retry)',
    conflict: 'Changed in another tab (click to overwrite)'
  }[status];
  const badgeClickable = status === 'unsaved' || status === 'error' || status === 'conflict';
  const exportFormats =
    fileMeta.type === 'doc'
      ? [
          {
            id: 'docx',
            label: 'Word Document (.docx)'
          },
          {
            id: 'pdf',
            label: 'PDF (.pdf)'
          },
          {
            id: 'jpg',
            label: 'JPEG Image (.jpg)'
          },
          {
            id: 'html',
            label: 'Web Page (.html)'
          }
        ]
      : [
          {
            id: 'xlsx',
            label: 'Spreadsheet (.xlsx)'
          },
          {
            id: 'pdf',
            label: 'PDF (.pdf)'
          },
          {
            id: 'jpg',
            label: 'JPEG Image (.jpg)'
          },
          {
            id: 'csv',
            label: 'CSV (.csv)'
          }
        ];
  return (
    <div className={'editor-shell mode-' + fileMeta.type}>
      <div className="accent-strip" />
      <header className="editor-topbar">
        <button type="button" className="btn" onClick={handleBack}>
          ‹ Files
        </button>
        <span className={'type-mark ' + fileMeta.type}>{fileMeta.type === 'doc' ? 'DOC' : 'SHEET'}</span>
        <input
          type="text"
          className="title-input"
          aria-label="File title"
          value={title}
          onChange={handleTitleChange}
        />
        <div className="export-wrap" ref={exportWrapRef}>
          <button
            type="button"
            className="btn"
            aria-expanded={exportMenuOpen}
            aria-haspopup="menu"
            disabled={!!exportBusy}
            onClick={() => setExportMenuOpen((o) => !o)}
          >
            {exportBusy ? 'Exporting ' + exportBusy.toUpperCase() + '…' : 'Export ▾'}
          </button>
          {exportMenuOpen ? (
            <div className="export-menu" role="menu">
              {exportFormats.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="menuitem"
                  className="export-item"
                  onClick={() => runExport(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className={
            'save-badge' +
            (badgeClickable ? ' clickable' : '') +
            (status === 'error' ? ' error' : '') +
            (status === 'conflict' ? ' conflict' : '')
          }
          disabled={!badgeClickable}
          onClick={() => {
            if (status === 'conflict') flush(true);
            else if (status === 'unsaved' || status === 'error') flush(false);
          }}
        >
          {badgeLabel}
        </button>
        <span className="topbar-spacer" />
        <button
          type="button"
          className={'btn' + (lang === 'ur' ? ' active' : '')}
          aria-pressed={lang === 'ur'}
          aria-label="Toggle English or Urdu typing"
          onClick={onToggleLang}
        >
          {lang === 'ur' ? 'اردو' : 'EN'}
        </button>
        <button
          type="button"
          className={'btn' + (kbOpen ? ' active' : '')}
          aria-pressed={kbOpen}
          aria-label="Toggle on-screen keyboard"
          onClick={onToggleKb}
        >
          ⌨
        </button>
        <button type="button" className="btn" aria-label="Toggle light or dark theme" onClick={onToggleTheme}>
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
      </header>
      {notice ? (
        <div className={'notice-bar' + (notice.isError ? ' error' : '')} role="status">
          <span>{notice.text}</span>
          <button
            type="button"
            className="icon-btn"
            aria-label="Dismiss notice"
            onClick={() => setNotice(null)}
          >
            ×
          </button>
        </div>
      ) : null}
      {fileMeta.type === 'doc' ? (
        <WordEditor
          key={fileMeta.id}
          fileId={fileMeta.id}
          initialData={initialData}
          onContentChange={handleContentChange}
          registerExportApi={(api) => {
            exportApiRef.current = api;
          }}
          docRestoreFocusRef={docRestoreFocusRef}
          onNotice={showNotice}
        />
      ) : (
        <SpreadsheetEditor
          key={fileMeta.id}
          fileId={fileMeta.id}
          initialData={initialData}
          onContentChange={handleContentChange}
          registerExportApi={(api) => {
            exportApiRef.current = api;
          }}
          gridStartEditRef={gridStartEditRef}
          lang={lang}
        />
      )}
    </div>
  );
}
