export const PAGE_DIMS = {
  A4: {
    w: 794,
    h: 1123
  },
  Letter: {
    w: 816,
    h: 1056
  }
};

export function getPageDimensions(pageSize, orientation) {
  const base = PAGE_DIMS[pageSize] || PAGE_DIMS.A4;
  return orientation === 'landscape'
    ? {
        w: base.h,
        h: base.w
      }
    : {
        w: base.w,
        h: base.h
      };
}

export function getCaretRangeAtPoint(x, y) {
  if (document.caretRangeFromPoint) {
    return document.caretRangeFromPoint(x, y);
  }
  if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(x, y);
    if (pos) {
      const r = document.createRange();
      r.setStart(pos.offsetNode, pos.offset);
      r.collapse(true);
      return r;
    }
  }
  return null;
}

export function applyImageWrapStyle(img, mode, pageEl) {
  const prevMode = img.getAttribute('data-wrap') || 'inline';
  const isNowAbs = mode === 'behind' || mode === 'front';
  const wasAbs = prevMode === 'behind' || prevMode === 'front';
  if (isNowAbs && !wasAbs && pageEl) {
    const pRect = pageEl.getBoundingClientRect();
    const iRect = img.getBoundingClientRect();
    const left = Math.max(0, Math.round(iRect.left - pRect.left));
    const top = Math.max(0, Math.round(iRect.top - pRect.top));
    img.style.left = left + 'px';
    img.style.top = top + 'px';
  }
  img.setAttribute('data-wrap', mode);
  if (mode === 'inline') {
    img.style.position = 'static';
    img.style.float = 'none';
    img.style.zIndex = 'auto';
    img.style.left = '';
    img.style.top = '';
    img.style.display = 'inline-block';
    img.style.margin = '4px 2px';
    img.style.verticalAlign = 'baseline';
  } else if (mode === 'left') {
    img.style.position = 'static';
    img.style.float = 'left';
    img.style.zIndex = 'auto';
    img.style.left = '';
    img.style.top = '';
    img.style.display = 'block';
    img.style.margin = '4px 14px 8px 0';
  } else if (mode === 'right') {
    img.style.position = 'static';
    img.style.float = 'right';
    img.style.zIndex = 'auto';
    img.style.left = '';
    img.style.top = '';
    img.style.display = 'block';
    img.style.margin = '4px 0 8px 14px';
  } else if (mode === 'behind') {
    img.style.position = 'absolute';
    img.style.float = 'none';
    img.style.zIndex = '-1';
    img.style.display = 'block';
    img.style.margin = '0';
    if (!img.style.left) img.style.left = '96px';
    if (!img.style.top) img.style.top = '96px';
  } else if (mode === 'front') {
    img.style.position = 'absolute';
    img.style.float = 'none';
    img.style.zIndex = '1';
    img.style.display = 'block';
    img.style.margin = '0';
    if (!img.style.left) img.style.left = '96px';
    if (!img.style.top) img.style.top = '96px';
  }
}
