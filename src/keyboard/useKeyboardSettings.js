import { useEffect, useState } from 'react';
import { lsGet, lsSet } from '../lib/storage.js';
import { DEFAULT_MODE, SIDEBAR_MIN_WIDTH, isValidMode } from './constants.js';

export function clampSidebarWidth(px) {
  const max = Math.max(SIDEBAR_MIN_WIDTH, Math.round(window.innerWidth * 0.7));
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(max, Math.round(px)));
}

function readInitialWidth() {
  const saved = parseInt(lsGet('kbw', ''), 10);
  const fallback = Math.round(window.innerWidth * 0.25);
  return clampSidebarWidth(isNaN(saved) ? fallback : saved);
}

function readInitialMode() {
  const saved = lsGet('kbmode', DEFAULT_MODE);
  return isValidMode(saved) ? saved : DEFAULT_MODE;
}

function readInitialPos() {
  try {
    const p = JSON.parse(lsGet('kbpos', 'null'));
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return { x: p.x, y: p.y };
  } catch (e) {}
  return null;
}

function persist(key, value) {
  try {
    lsSet(key, value);
  } catch (e) {}
}

/** Everything the on-screen keyboard remembers between visits. */
export function useKeyboardSettings() {
  const [open, setOpen] = useState(() => lsGet('kbopen', '0') === '1');
  const [mode, setMode] = useState(readInitialMode);
  const [sidebarWidth, setSidebarWidth] = useState(readInitialWidth);
  const [floatPos, setFloatPos] = useState(readInitialPos); // null = default spot (bottom centre)

  useEffect(() => persist('kbopen', open ? '1' : '0'), [open]);
  useEffect(() => persist('kbmode', mode), [mode]);
  useEffect(() => persist('kbw', String(sidebarWidth)), [sidebarWidth]);
  useEffect(() => {
    if (floatPos) persist('kbpos', JSON.stringify(floatPos));
  }, [floatPos]);

  return {
    open,
    mode,
    sidebarWidth,
    floatPos,
    toggleOpen: () => setOpen((o) => !o),
    close: () => setOpen(false),
    setMode,
    setSidebarWidth,
    setFloatPos
  };
}
