import { useCallback, useEffect, useState } from 'react';
import { defaultDocContent, defaultSheetContent, loadFilesIndex, saveFilesIndex } from '../lib/files.js';
import { lsDel, lsGet, lsSet, uid } from '../lib/storage.js';

/** The list of documents/workbooks on the home screen, backed by localStorage. */
export function useFileLibrary() {
  const [files, setFiles] = useState(() => loadFilesIndex());

  // Another tab changed the file list
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'files') setFiles(loadFilesIndex());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const reload = useCallback(() => setFiles(loadFilesIndex()), []);

  /** Creates a file and returns its id. */
  const createFile = (type) => {
    const id = uid();
    const title = type === 'doc' ? 'Untitled document' : 'Untitled workbook';
    const content = type === 'doc' ? defaultDocContent() : defaultSheetContent();
    const meta = { id, title, type, updatedAt: Date.now() };
    lsSet('f:' + id, JSON.stringify(content));
    lsSet('v:' + id, '1');
    const next = [meta, ...loadFilesIndex()];
    saveFilesIndex(next);
    setFiles(next);
    return id;
  };

  const duplicateFile = (srcId) => {
    const idx = loadFilesIndex();
    const src = idx.find((f) => f.id === srcId);
    if (!src) return;
    const newId = uid();
    const rawContent = lsGet('f:' + srcId, '');
    lsSet(
      'f:' + newId,
      rawContent || JSON.stringify(src.type === 'doc' ? defaultDocContent() : defaultSheetContent())
    );
    lsSet('v:' + newId, '1');
    const copyMeta = {
      id: newId,
      title: (src.title || 'Untitled') + ' (Copy)',
      type: src.type,
      updatedAt: Date.now()
    };
    const next = [copyMeta, ...idx];
    saveFilesIndex(next);
    setFiles(next);
  };

  const deleteFile = (id) => {
    lsDel('f:' + id);
    lsDel('v:' + id);
    const next = loadFilesIndex().filter((f) => f.id !== id);
    saveFilesIndex(next);
    setFiles(next);
  };

  const touchFile = useCallback((id, title, updatedAt) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? Object.assign({}, f, { title, updatedAt }) : f)));
  }, []);

  return { files, reload, createFile, duplicateFile, deleteFile, touchFile };
}
