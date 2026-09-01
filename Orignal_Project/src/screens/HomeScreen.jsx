import { useMemo, useState } from 'react';
import { SvgIcon } from '../components/SvgIcon.jsx';
import { formatModTime } from '../lib/files.js';

export function HomeScreen({
  files,
  onOpenFile,
  onCreateFile,
  onDuplicateFile,
  onDeleteFile,
  theme,
  onToggleTheme,
  lang,
  onToggleLang,
  kbOpen,
  onToggleKb
}) {
  const [query, setQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...files].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    if (!q) return sorted;
    return sorted.filter(
      (f) => (f.title || '').toLowerCase().includes(q) || f.type.toLowerCase().includes(q)
    );
  }, [files, query]);
  return (
    <div className="home-wrap">
      <header className="home-topbar">
        <span className="wordmark">Deskwork</span>
        <div className="topbar-actions">
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
          <button
            type="button"
            className="btn"
            aria-label="Toggle light or dark theme"
            onClick={onToggleTheme}
          >
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>
      </header>
      <main className="home-body">
        <div className="home-tiles">
          <button type="button" className="tile-btn doc" onClick={() => onCreateFile('doc')}>
            <span className="tile-icon">
              <SvgIcon
                size={18}
                d={[
                  'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
                  'M14 2v6h6',
                  'M8 13h8',
                  'M8 17h5'
                ]}
              />
            </span>
            <span>
              <span className="tile-title">New document</span>
              <span className="tile-sub">Rich text, tables, images, page breaks</span>
            </span>
          </button>
          <button type="button" className="tile-btn sheet" onClick={() => onCreateFile('sheet')}>
            <span className="tile-icon">
              <SvgIcon size={18} d={['M3 3h18v18H3z', 'M3 9h18', 'M3 15h18', 'M9 3v18', 'M15 3v18']} />
            </span>
            <span>
              <span className="tile-title">New workbook</span>
              <span className="tile-sub">100×26 grid, formulas, charts</span>
            </span>
          </button>
        </div>
        <div className="home-list-head">
          <span className="home-list-title">{'Recent files (' + filtered.length + ')'}</span>
          <input
            type="search"
            className="search-input"
            placeholder={'Search files…'}
            aria-label="Search files"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="file-table">
          {filtered.length === 0 ? (
            <div className="empty-state">
              {files.length === 0
                ? 'No files yet. Create a new document or workbook above.'
                : 'No matching files.'}
            </div>
          ) : (
            filtered.map((f) => (
              <div key={f.id} className="file-row">
                <span className={'type-mark ' + f.type}>{f.type === 'doc' ? 'DOC' : 'SHEET'}</span>
                <button type="button" className="file-open-btn" onClick={() => onOpenFile(f.id)}>
                  {f.title || 'Untitled'}
                </button>
                <span className="file-time">{formatModTime(f.updatedAt)}</span>
                <div className="file-actions">
                  <button type="button" className="btn" onClick={() => onDuplicateFile(f.id)}>
                    Duplicate
                  </button>
                  {confirmDeleteId === f.id ? (
                    <>
                      <button type="button" className="btn" onClick={() => setConfirmDeleteId(null)}>
                        Keep
                      </button>
                      <button
                        type="button"
                        className="btn danger"
                        onClick={() => {
                          setConfirmDeleteId(null);
                          onDeleteFile(f.id);
                        }}
                      >
                        Delete
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn" onClick={() => setConfirmDeleteId(f.id)}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
