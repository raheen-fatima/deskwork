import { URDU_MAP, isAsciiLetter } from './urduMap.js';
import { backspaceInInput, insertTextIntoEditable, insertTextIntoInput } from './textTargets.js';

/**
 * Sends an on-screen key press to whatever currently has focus:
 * the sheet grid, a text input / textarea, or the contentEditable document page.
 *
 * action: { type: 'char' | 'enter' | 'back', char?, rawEn?, directGlyph? }
 */
export function dispatchVirtualAction(action, { lang, gridStartEditRef, docRestoreFocusRef }) {
  let target = document.activeElement;
  if ((!target || target === document.body) && docRestoreFocusRef && docRestoreFocusRef.current) {
    docRestoreFocusRef.current();
    target = document.activeElement;
  }
  if (!target) return;

  // Spreadsheet grid (focused, not editing a cell)
  if (target.dataset && target.dataset.sheetGrid === 'true') {
    if (action.type === 'char' && gridStartEditRef.current) {
      const ch =
        lang === 'ur' && isAsciiLetter(action.rawEn) ? URDU_MAP[action.rawEn] || action.char : action.rawEn;
      gridStartEditRef.current(ch);
    } else if (action.type === 'enter') {
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    } else if (action.type === 'back') {
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    }
    return;
  }

  // Plain inputs and textareas
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
    const skipUrdu =
      (target.dataset && target.dataset.skipUrdu === 'true') || (target.value && target.value.startsWith('='));
    const lettersOnly = !!(target.dataset && target.dataset.urduLettersOnly === 'true');
    if (action.type === 'back') {
      backspaceInInput(target);
    } else if (action.type === 'enter') {
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    } else if (action.type === 'char') {
      let out = action.char;
      if (action.directGlyph) {
        out = skipUrdu || (lettersOnly && !isAsciiLetter(action.rawEn)) ? action.rawEn : action.directGlyph;
      } else if (skipUrdu || (lettersOnly && !isAsciiLetter(action.rawEn))) {
        out = action.rawEn;
      }
      insertTextIntoInput(target, out);
    }
    return;
  }

  // contentEditable document page
  const editable = target.isContentEditable
    ? target
    : target.closest
      ? target.closest('[contenteditable="true"]')
      : null;
  if (editable) {
    if (action.type === 'back') {
      document.execCommand('delete', false);
    } else if (action.type === 'enter') {
      document.execCommand('insertParagraph', false);
    } else if (action.type === 'char') {
      insertTextIntoEditable(editable, action.char);
    }
  }
}
