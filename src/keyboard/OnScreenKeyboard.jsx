import { useRef } from 'react';
import { KeyboardKeys } from './KeyboardKeys.jsx';
import { ModeSwitcher } from './ModeSwitcher.jsx';
import { clampSidebarWidth } from './useKeyboardSettings.js';
import { useFloatingDrag } from './useFloatingDrag.js';
import { useShift } from './useShift.js';
import { dispatchVirtualAction } from './virtualInput.js';

/**
 * One <aside> for all three display modes, so switching mode never remounts the keys
 * (Shift state is kept). Mode only changes the class, which CSS turns into layout:
 *   sidebar  - flex child on the right of the app
 *   bottom   - fixed, ~60% wide, centred along the bottom edge
 *   floating - fixed, same size as bottom, draggable by its header
 */
export function OnScreenKeyboard({ settings, lang, gridStartEditRef, docRestoreFocusRef }) {
  const { open, mode, sidebarWidth, floatPos, setMode, setSidebarWidth, setFloatPos, close } = settings;
  const panelRef = useRef(null);
  const shift = useShift();
  const drag = useFloatingDrag({
    enabled: open && mode === 'floating',
    panelRef,
    pos: floatPos,
    onPosChange: setFloatPos
  });

  if (!open) return null;

  const isSidebar = mode === 'sidebar';
  const isFloating = mode === 'floating';

  const onGripPointerDown = (e) => {
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
    const onMove = (ev) => setSidebarWidth(clampSidebarWidth(window.innerWidth - ev.clientX));
    const onEnd = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
  };

  const onGripKeyDown = (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); setSidebarWidth(clampSidebarWidth(sidebarWidth + 16)); }
    if (e.key === 'ArrowRight') { e.preventDefault(); setSidebarWidth(clampSidebarWidth(sidebarWidth - 16)); }
  };

  let style;
  if (isSidebar) style = { width: sidebarWidth + 'px' };
  else if (isFloating && floatPos) style = { left: floatPos.x + 'px', top: floatPos.y + 'px', bottom: 'auto' };

  return (
    <aside
      ref={panelRef}
      className={'kb-panel kb-panel--' + mode + (isFloating && !floatPos ? ' kb-panel--default-pos' : '')}
      style={style}
      aria-label="On-screen keyboard"
      // Keep focus (and the caret) in the editor while keys are pressed.
      onMouseDown={(e) => e.preventDefault()}
    >
      {isSidebar ? (
        <div
          className="kb-resize-grip"
          tabIndex={0}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize keyboard panel"
          onPointerDown={onGripPointerDown}
          onKeyDown={onGripKeyDown}
        />
      ) : null}

      <div className="kb-header" {...(isFloating ? drag : {})}>
        <span className="kb-title">{lang === 'ur' ? 'Keyboard (Urdu)' : 'Keyboard (English)'}</span>
        <ModeSwitcher mode={mode} onChange={setMode} />
        <button type="button" className="icon-btn" onClick={close} aria-label="Close keyboard">
          ×
        </button>
      </div>

      <div className="kb-stage">
        <KeyboardKeys
          lang={lang}
          shiftActive={shift.shiftActive}
          stickyShift={shift.stickyShift}
          onToggleShift={shift.toggleSticky}
          onClearShift={shift.clearSticky}
          onAction={(action) => dispatchVirtualAction(action, { lang, gridStartEditRef, docRestoreFocusRef })}
        />
      </div>
    </aside>
  );
}
