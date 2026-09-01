import { useCallback, useEffect, useRef } from 'react';

/**
 * Drag handlers for the floating keyboard's header.
 * The position is kept in px (top-left corner) and clamped so the keyboard stays on screen.
 */
export function useFloatingDrag({ enabled, panelRef, pos, onPosChange }) {
  const dragRef = useRef(null);

  const clamp = useCallback(
    (x, y) => {
      const el = panelRef.current;
      if (!el) return { x, y };
      const { width, height } = el.getBoundingClientRect();
      return {
        x: Math.min(Math.max(0, x), Math.max(0, window.innerWidth - width)),
        y: Math.min(Math.max(0, y), Math.max(0, window.innerHeight - height))
      };
    },
    [panelRef]
  );

  const onPointerDown = (e) => {
    if (!enabled || e.button !== 0 || !panelRef.current) return;
    if (e.target.closest('button')) return; // let the header buttons work normally
    const rect = panelRef.current.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
    onPosChange(clamp(rect.left, rect.top)); // switch from the default spot to an explicit position
  };

  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    onPosChange(clamp(e.clientX - d.dx, e.clientY - d.dy));
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  // Keep the keyboard reachable when the window shrinks.
  useEffect(() => {
    if (!enabled || !pos) return undefined;
    const onResize = () => {
      const c = clamp(pos.x, pos.y);
      if (c.x !== pos.x || c.y !== pos.y) onPosChange(c);
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [enabled, pos, clamp, onPosChange]);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp };
}
