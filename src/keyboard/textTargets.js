export function insertTextIntoInput(el, text) {
  const proto =
    el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  const start = typeof el.selectionStart === 'number' ? el.selectionStart : el.value.length;
  const end = typeof el.selectionEnd === 'number' ? el.selectionEnd : el.value.length;
  const nextVal = el.value.slice(0, start) + text + el.value.slice(end);
  setter.call(el, nextVal);
  try {
    el.setSelectionRange(start + text.length, start + text.length);
  } catch (e) {}
  el.dispatchEvent(
    new Event('input', {
      bubbles: true
    })
  );
}

export function backspaceInInput(el) {
  const proto =
    el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  const start = typeof el.selectionStart === 'number' ? el.selectionStart : el.value.length;
  const end = typeof el.selectionEnd === 'number' ? el.selectionEnd : el.value.length;
  let nextVal = el.value;
  let caret = start;
  if (start !== end) {
    nextVal = el.value.slice(0, start) + el.value.slice(end);
  } else if (start > 0) {
    nextVal = el.value.slice(0, start - 1) + el.value.slice(end);
    caret = start - 1;
  }
  setter.call(el, nextVal);
  try {
    el.setSelectionRange(caret, caret);
  } catch (e) {}
  el.dispatchEvent(
    new Event('input', {
      bubbles: true
    })
  );
}

export function insertTextIntoEditable(el, text) {
  el.focus();
  try {
    document.execCommand('insertText', false, text);
  } catch (e) {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const r = sel.getRangeAt(0);
      r.deleteContents();
      const tn = document.createTextNode(text);
      r.insertNode(tn);
      r.setStartAfter(tn);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  }
}
