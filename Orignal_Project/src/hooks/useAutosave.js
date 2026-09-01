import { useCallback, useEffect, useRef, useState } from 'react';
import { loadFilesIndex, readFileVersion, saveFilesIndex } from '../lib/files.js';
import { lsSet } from '../lib/storage.js';

export function useAutosave(fileId, getSnapshot, onIndexTouch) {
  const [status, setStatus] = useState('saved'); // 'saved' | 'saving' | 'unsaved' | 'error' | 'conflict'
  const knownVersionRef = useRef(readFileVersion(fileId));
  const timerRef = useRef(null);
  const dirtyRef = useRef(false);
  const writingRef = useRef(false);
  const pendingForceRef = useRef(false);
  const getSnapshotRef = useRef(getSnapshot);
  const onIndexTouchRef = useRef(onIndexTouch);
  getSnapshotRef.current = getSnapshot;
  onIndexTouchRef.current = onIndexTouch;
  useEffect(() => {
    knownVersionRef.current = readFileVersion(fileId);
    dirtyRef.current = false;
    setStatus('saved');
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [fileId]);
  const performWrite = useCallback(
    (forceOverwrite) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (!dirtyRef.current && !forceOverwrite) {
        return true;
      }
      if (writingRef.current) {
        pendingForceRef.current = pendingForceRef.current || !!forceOverwrite;
        return false;
      }
      writingRef.current = true;
      setStatus('saving');
      try {
        const diskVer = readFileVersion(fileId);
        if (!forceOverwrite && diskVer !== knownVersionRef.current) {
          writingRef.current = false;
          setStatus('conflict');
          return false;
        }
        const payload = getSnapshotRef.current();
        const nextVer = Math.max(knownVersionRef.current, diskVer) + 1;
        lsSet('f:' + fileId, JSON.stringify(payload.content));
        lsSet('v:' + fileId, String(nextVer));
        const now = Date.now();
        const idx = loadFilesIndex();
        const pos = idx.findIndex((f) => f.id === fileId);
        if (pos >= 0) {
          idx[pos] = Object.assign({}, idx[pos], {
            title: payload.title,
            updatedAt: now
          });
          saveFilesIndex(idx);
        }
        knownVersionRef.current = nextVer;
        dirtyRef.current = false;
        writingRef.current = false;
        setStatus('saved');
        if (onIndexTouchRef.current) onIndexTouchRef.current(payload.title, now);
        return true;
      } catch (err) {
        writingRef.current = false;
        setStatus('error');
        return false;
      }
    },
    [fileId]
  );
  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    setStatus((prev) => (prev === 'conflict' ? 'conflict' : 'unsaved'));
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      performWrite(false);
    }, 1200);
  }, [performWrite]);
  const flush = useCallback(
    (forceOverwrite) => {
      if (!dirtyRef.current && !forceOverwrite) return true;
      return performWrite(!!forceOverwrite);
    },
    [performWrite]
  );
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'v:' + fileId) {
        const nextV = parseInt(e.newValue || '0', 10);
        if (nextV && nextV !== knownVersionRef.current) {
          setStatus('conflict');
        }
      }
    };
    const onBeforeUnload = (e) => {
      if (dirtyRef.current) {
        const ok = performWrite(false);
        if (!ok) {
          e.preventDefault();
          e.returnValue = '';
        }
      }
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('beforeunload', onBeforeUnload);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fileId, performWrite]);
  return {
    status,
    markDirty,
    flush
  };
}
