import { useEffect } from 'react';
import { insertTextIntoEditable, insertTextIntoInput } from './textTargets.js';
import { URDU_MAP, isAsciiLetter, mapKeyForTarget } from './urduMap.js';

export function useGlobalUrduKeydown(lang, gridStartEditRef) {
  useEffect(() => {
    const onKeyDown = (e) => {
      if (lang !== 'ur') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (!e.key || e.key.length !== 1) return;
      const t = e.target;
      if (!t) return;

      // Grid focused (not editing)
      if (t.dataset && t.dataset.sheetGrid === 'true') {
        if (isAsciiLetter(e.key) && gridStartEditRef.current) {
          e.preventDefault();
          e.stopPropagation();
          gridStartEditRef.current(URDU_MAP[e.key]);
        }
        return;
      }

      // Skip special inputs (Name box, link address, non-text inputs)
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') {
        const type = (t.type || 'text').toLowerCase();
        if (t.tagName === 'INPUT' && !['text', 'search', 'url', 'email'].includes(type)) return;
        if (t.dataset && t.dataset.skipUrdu === 'true') return;
        if (t.value && t.value.startsWith('=')) return;
        const lettersOnly = !!(t.dataset && t.dataset.urduLettersOnly === 'true');
        const mapped = mapKeyForTarget(e.key, 'ur', lettersOnly);
        if (mapped !== e.key) {
          e.preventDefault();
          e.stopPropagation();
          insertTextIntoInput(t, mapped);
        }
        return;
      }

      // contentEditable document page
      const editable = t.isContentEditable ? t : t.closest ? t.closest('[contenteditable="true"]') : null;
      if (editable) {
        const mapped = mapKeyForTarget(e.key, 'ur', false);
        if (mapped !== e.key) {
          e.preventDefault();
          e.stopPropagation();
          insertTextIntoEditable(editable, mapped);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [lang, gridStartEditRef]);
}
