import { useCallback, useEffect, useRef, useState } from 'react';
import { SvgIcon } from '../../components/SvgIcon.jsx';
import { applyImageWrapStyle, getCaretRangeAtPoint, getPageDimensions } from './pageUtils.js';

export function WordEditor({
  fileId,
  initialData,
  onContentChange,
  registerExportApi,
  docRestoreFocusRef,
  onNotice
}) {
  const [pageSize, setPageSize] = useState(initialData.pageSize || 'A4');
  const [orientation, setOrientation] = useState(initialData.orientation || 'portrait');
  const [cmdState, setCmdState] = useState({});
  const [stats, setStats] = useState({
    words: 0,
    chars: 0,
    pages: 1
  });
  const [selectedImg, setSelectedImg] = useState(null);
  const [overlayRect, setOverlayRect] = useState(null);
  const [showLinkBar, setShowLinkBar] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkErr, setLinkErr] = useState('');
  const [showFindBar, setShowFindBar] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [findMsg, setFindMsg] = useState('');
  const [textColor, setTextColor] = useState('#111827');
  const [hiliteColor, setHiliteColor] = useState('#fef08a');
  const pageRef = useRef(null);
  const scrollRef = useRef(null);
  const overlayRef = useRef(null);
  const lastRangeRef = useRef(null);
  const selectedImgRef = useRef(null);
  selectedImgRef.current = selectedImg;
  const dims = getPageDimensions(pageSize, orientation);
  const recomputePageBreaks = useCallback(() => {
    const pageEl = pageRef.current;
    const scrollEl = scrollRef.current;
    if (!pageEl) return;
    const savedScroll = scrollEl ? scrollEl.scrollTop : 0;
    const pbs = pageEl.querySelectorAll('.pb');
    pbs.forEach((pb) => {
      pb.style.height = '0px';
    });
    pbs.forEach((pb) => {
      const top = pb.offsetTop;
      const pbH = dims.h - (top % dims.h) + 96;
      pb.style.height = pbH + 'px';
    });
    if (scrollEl) scrollEl.scrollTop = savedScroll;
  }, [dims.h]);
  const updateStatsAndNotify = useCallback(
    (nextPS, nextOr) => {
      const pageEl = pageRef.current;
      if (!pageEl) return;
      const txt = (pageEl.innerText || '').replace(/\u00A0/g, ' ').trim();
      const words = txt ? txt.split(/\s+/).filter(Boolean).length : 0;
      const chars = txt.length;
      const ps = nextPS || pageSize;
      const or = nextOr || orientation;
      const d = getPageDimensions(ps, or);
      const pages = Math.max(1, Math.ceil(pageEl.scrollHeight / d.h));
      setStats({
        words,
        chars,
        pages
      });
      onContentChange({
        html: pageEl.innerHTML,
        pageSize: ps,
        orientation: or
      });
    },
    [pageSize, orientation, onContentChange]
  );
  const syncOverlay = useCallback(() => {
    const img = selectedImgRef.current;
    const pageEl = pageRef.current;
    if (!img || !pageEl || !pageEl.contains(img)) {
      if (selectedImgRef.current) setSelectedImg(null);
      setOverlayRect(null);
      return;
    }
    const pRect = pageEl.getBoundingClientRect();
    const iRect = img.getBoundingClientRect();
    setOverlayRect({
      left: iRect.left - pRect.left,
      top: iRect.top - pRect.top,
      width: iRect.width,
      height: iRect.height
    });
  }, []);
  const refreshCommandStates = useCallback(() => {
    const pageEl = pageRef.current;
    if (!pageEl) return;
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const r = sel.getRangeAt(0);
      if (pageEl.contains(r.commonAncestorContainer)) {
        lastRangeRef.current = r.cloneRange();
      }
    }
    try {
      let blockTag = 'p';
      let lineSpacing = '1.5';
      let node = lastRangeRef.current ? lastRangeRef.current.startContainer : null;
      while (node && node !== pageEl) {
        if (node.nodeType === 1) {
          const tag = node.tagName.toLowerCase();
          if (['p', 'h1', 'h2', 'h3', 'li', 'div'].includes(tag) && !node.classList.contains('pb')) {
            if (['p', 'h1', 'h2', 'h3'].includes(tag)) blockTag = tag;
            const lh = node.style.lineHeight;
            if (lh) lineSpacing = lh;
            break;
          }
        }
        node = node.parentNode;
      }
      setCmdState({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        strikeThrough: document.queryCommandState('strikeThrough'),
        subscript: document.queryCommandState('subscript'),
        superscript: document.queryCommandState('superscript'),
        justifyLeft: document.queryCommandState('justifyLeft'),
        justifyCenter: document.queryCommandState('justifyCenter'),
        justifyRight: document.queryCommandState('justifyRight'),
        justifyFull: document.queryCommandState('justifyFull'),
        insertUnorderedList: document.queryCommandState('insertUnorderedList'),
        insertOrderedList: document.queryCommandState('insertOrderedList'),
        blockTag,
        lineSpacing
      });
    } catch (e) {}
  }, []);
  const restoreSelection = useCallback(() => {
    const pageEl = pageRef.current;
    if (!pageEl) return;
    pageEl.focus();
    const sel = window.getSelection();
    if (!sel) return;
    const saved = lastRangeRef.current;
    if (
      saved &&
      saved.startContainer.isConnected &&
      saved.endContainer.isConnected &&
      pageEl.contains(saved.startContainer) &&
      pageEl.contains(saved.endContainer)
    ) {
      sel.removeAllRanges();
      sel.addRange(saved);
      return;
    }
    const r = document.createRange();
    r.selectNodeContents(pageEl);
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);
    lastRangeRef.current = r.cloneRange();
  }, []);
  useEffect(() => {
    if (docRestoreFocusRef) docRestoreFocusRef.current = restoreSelection;
    return () => {
      if (docRestoreFocusRef) docRestoreFocusRef.current = null;
    };
  }, [docRestoreFocusRef, restoreSelection]);
  useEffect(() => {
    if (registerExportApi) {
      registerExportApi({
        getPageElement: () => pageRef.current,
        getDimensions: () => getPageDimensions(pageSize, orientation),
        getPageConfig: () => ({
          pageSize,
          orientation
        })
      });
    }
  }, [registerExportApi, pageSize, orientation]);

  // Initialize innerHTML once per fileId
  useEffect(() => {
    const pageEl = pageRef.current;
    if (!pageEl) return;
    pageEl.innerHTML = initialData.html || '<p><br></p>';
    setPageSize(initialData.pageSize || 'A4');
    setOrientation(initialData.orientation || 'portrait');
    setSelectedImg(null);
    setOverlayRect(null);
    lastRangeRef.current = null;
    try {
      document.execCommand('styleWithCSS', false, true);
      document.execCommand('defaultParagraphSeparator', false, 'p');
    } catch (e) {}
    requestAnimationFrame(() => {
      recomputePageBreaks();
      const txt = (pageEl.innerText || '').replace(/\u00A0/g, ' ').trim();
      const words = txt ? txt.split(/\s+/).filter(Boolean).length : 0;
      const d = getPageDimensions(initialData.pageSize || 'A4', initialData.orientation || 'portrait');
      setStats({
        words,
        chars: txt.length,
        pages: Math.max(1, Math.ceil(pageEl.scrollHeight / d.h))
      });
    });
  }, [fileId]);
  useEffect(() => {
    recomputePageBreaks();
    syncOverlay();
  }, [dims.w, dims.h, recomputePageBreaks, syncOverlay]);
  useEffect(() => {
    const onSel = () => refreshCommandStates();
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, [refreshCommandStates]);
  const exec = (cmd, val) => {
    restoreSelection();
    try {
      document.execCommand('styleWithCSS', false, true);
      document.execCommand('defaultParagraphSeparator', false, 'p');
      document.execCommand(cmd, false, val === undefined ? null : val);
    } catch (e) {}
    recomputePageBreaks();
    refreshCommandStates();
    syncOverlay();
    updateStatsAndNotify();
  };
  const applyFontSize = (px) => {
    restoreSelection();
    const pageEl = pageRef.current;
    if (!pageEl) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) {
      const span = document.createElement('span');
      span.style.fontSize = px;
      span.innerHTML = '\u200B';
      range.insertNode(span);
      const nr = document.createRange();
      nr.setStart(span.firstChild, 1);
      nr.collapse(true);
      sel.removeAllRanges();
      sel.addRange(nr);
    } else {
      document.execCommand('styleWithCSS', false, true);
      document.execCommand('fontSize', false, '7');
      pageEl.querySelectorAll('font[size="7"]').forEach((f) => {
        const s = document.createElement('span');
        s.style.fontSize = px;
        while (f.firstChild) s.appendChild(f.firstChild);
        f.parentNode.replaceChild(s, f);
      });
      pageEl.querySelectorAll('span[style*="xxx-large"], span[style*="-webkit-xxx-large"]').forEach((s) => {
        s.style.fontSize = px;
      });
    }
    recomputePageBreaks();
    refreshCommandStates();
    updateStatsAndNotify();
  };
  const applyLineSpacing = (val) => {
    restoreSelection();
    const pageEl = pageRef.current;
    const sel = window.getSelection();
    if (!pageEl || !sel || sel.rangeCount === 0) return;
    let node = sel.getRangeAt(0).startContainer;
    let block = null;
    while (node && node !== pageEl) {
      if (
        node.nodeType === 1 &&
        ['P', 'H1', 'H2', 'H3', 'LI', 'DIV'].includes(node.tagName) &&
        !node.classList.contains('pb')
      ) {
        block = node;
        break;
      }
      node = node.parentNode;
    }
    if (!block) {
      document.execCommand('formatBlock', false, 'p');
      node = sel.getRangeAt(0).startContainer;
      while (node && node !== pageEl) {
        if (node.nodeType === 1 && ['P', 'H1', 'H2', 'H3', 'LI', 'DIV'].includes(node.tagName)) {
          block = node;
          break;
        }
        node = node.parentNode;
      }
    }
    if (block) {
      block.style.lineHeight = val;
      recomputePageBreaks();
      refreshCommandStates();
      updateStatsAndNotify();
    }
  };
  const insertTable3x3 = () => {
    restoreSelection();
    const html =
      '<table><tbody>' +
      '<tr><td><p><br></p></td><td><p><br></p></td><td><p><br></p></td></tr>' +
      '<tr><td><p><br></p></td><td><p><br></p></td><td><p><br></p></td></tr>' +
      '<tr><td><p><br></p></td><td><p><br></p></td><td><p><br></p></td></tr>' +
      '</tbody></table><p><br></p>';
    document.execCommand('insertHTML', false, html);
    recomputePageBreaks();
    updateStatsAndNotify();
  };
  const modifyTable = (op) => {
    restoreSelection();
    const pageEl = pageRef.current;
    const sel = window.getSelection();
    if (!pageEl || !sel || sel.rangeCount === 0) return;
    let el = sel.getRangeAt(0).startContainer;
    if (el.nodeType === 3) el = el.parentNode;
    const td = el.closest ? el.closest('td, th') : null;
    if (!td || !pageEl.contains(td)) return;
    const tr = td.parentElement;
    const table = td.closest('table');
    if (!tr || !table) return;
    const colIdx = Array.from(tr.children).indexOf(td);
    const rows = Array.from(table.rows);
    if (op === 'addRow') {
      const newTr = tr.cloneNode(false);
      for (let i = 0; i < tr.cells.length; i++) {
        const c = document.createElement('td');
        c.innerHTML = '<p><br></p>';
        newTr.appendChild(c);
      }
      tr.parentNode.insertBefore(newTr, tr.nextSibling);
    } else if (op === 'delRow') {
      if (rows.length <= 1) table.remove();
      else tr.remove();
    } else if (op === 'addCol') {
      rows.forEach((r) => {
        const c = document.createElement('td');
        c.innerHTML = '<p><br></p>';
        const ref = r.cells[colIdx + 1] || null;
        r.insertBefore(c, ref);
      });
    } else if (op === 'delCol') {
      if (tr.cells.length <= 1) table.remove();
      else
        rows.forEach((r) => {
          if (r.cells[colIdx]) r.cells[colIdx].remove();
        });
    }
    recomputePageBreaks();
    updateStatsAndNotify();
  };
  const insertPageBreak = () => {
    restoreSelection();
    const pageEl = pageRef.current;
    const sel = window.getSelection();
    if (!pageEl || !sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const pb = document.createElement('div');
    pb.className = 'pb';
    pb.setAttribute('contenteditable', 'false');
    const lbl = document.createElement('span');
    lbl.textContent = 'Page break';
    pb.appendChild(lbl);

    // Split out of current block if inside p/h1/h2/h3/div
    let block = range.startContainer;
    while (block && block.parentNode !== pageEl) block = block.parentNode;
    const afterP = document.createElement('p');
    afterP.innerHTML = '<br>';
    if (block && block.parentNode === pageEl) {
      pageEl.insertBefore(pb, block.nextSibling);
      pageEl.insertBefore(afterP, pb.nextSibling);
    } else {
      pageEl.appendChild(pb);
      pageEl.appendChild(afterP);
    }
    const nr = document.createRange();
    nr.setStart(afterP, 0);
    nr.collapse(true);
    sel.removeAllRanges();
    sel.addRange(nr);
    lastRangeRef.current = nr.cloneRange();
    recomputePageBreaks();
    updateStatsAndNotify();
  };
  const handleImageUpload = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) {
      if (onNotice) onNotice('Image exceeds 1.5 MB limit.', true);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      restoreSelection();
      const pageEl = pageRef.current;
      const sel = window.getSelection();
      if (!pageEl || !sel || sel.rangeCount === 0) return;
      const img = document.createElement('img');
      img.src = reader.result;
      img.alt = file.name || 'Inserted image';
      img.style.width = '240px';
      img.style.height = 'auto';
      applyImageWrapStyle(img, 'inline', pageEl);
      const r = sel.getRangeAt(0);
      r.deleteContents();
      r.insertNode(img);
      const nr = document.createRange();
      nr.setStartAfter(img);
      nr.collapse(true);
      sel.removeAllRanges();
      sel.addRange(nr);
      lastRangeRef.current = nr.cloneRange();
      img.onload = () => {
        const maxW = dims.w - 192;
        if (img.naturalWidth && img.naturalWidth < 240) {
          img.style.width = img.naturalWidth + 'px';
        } else if (img.naturalWidth > maxW) {
          img.style.width = Math.min(320, maxW) + 'px';
        }
        setSelectedImg(img);
        requestAnimationFrame(() => {
          syncOverlay();
          recomputePageBreaks();
          updateStatsAndNotify();
        });
      };
      setSelectedImg(img);
      requestAnimationFrame(() => {
        syncOverlay();
        recomputePageBreaks();
        updateStatsAndNotify();
      });
    };
    reader.readAsDataURL(file);
  };
  const applyLink = (e) => {
    e.preventDefault();
    let raw = linkUrl.trim();
    if (!raw) {
      setLinkErr('Enter a URL.');
      return;
    }
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) {
      raw = 'https://' + raw;
    }
    if (!/^(https?:|mailto:)/i.test(raw)) {
      setLinkErr('Only http, https, or mailto links are allowed.');
      return;
    }
    setLinkErr('');
    const img = selectedImgRef.current;
    const pageEl = pageRef.current;
    if (img && pageEl && pageEl.contains(img)) {
      const parentA = img.parentElement && img.parentElement.tagName === 'A' ? img.parentElement : null;
      if (parentA) {
        parentA.setAttribute('href', raw);
        parentA.setAttribute('target', '_blank');
        parentA.setAttribute('rel', 'noopener noreferrer');
      } else {
        const a = document.createElement('a');
        a.setAttribute('href', raw);
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
        img.parentNode.insertBefore(a, img);
        a.appendChild(img);
      }
      setShowLinkBar(false);
      updateStatsAndNotify();
      return;
    }
    restoreSelection();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const r = sel.getRangeAt(0);
    if (r.collapsed) {
      const a = document.createElement('a');
      a.href = raw;
      a.textContent = raw;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      r.insertNode(a);
      const nr = document.createRange();
      nr.setStartAfter(a);
      nr.collapse(true);
      sel.removeAllRanges();
      sel.addRange(nr);
      lastRangeRef.current = nr.cloneRange();
    } else {
      document.execCommand('createLink', false, raw);
      const aNode =
        sel.anchorNode &&
        (sel.anchorNode.nodeType === 1
          ? sel.anchorNode.closest('a')
          : sel.anchorNode.parentElement.closest('a'));
      if (aNode) {
        aNode.target = '_blank';
        aNode.rel = 'noopener noreferrer';
      }
    }
    setShowLinkBar(false);
    updateStatsAndNotify();
  };
  const removeLink = () => {
    const img = selectedImgRef.current;
    if (img && img.parentElement && img.parentElement.tagName === 'A') {
      const a = img.parentElement;
      a.parentNode.insertBefore(img, a);
      a.remove();
      setShowLinkBar(false);
      updateStatsAndNotify();
      return;
    }
    restoreSelection();
    document.execCommand('unlink', false);
    setShowLinkBar(false);
    updateStatsAndNotify();
  };
  const findNext = () => {
    const pageEl = pageRef.current;
    if (!pageEl || !findQuery) return;
    const q = findQuery.toLowerCase();
    const walker = document.createTreeWalker(pageEl, NodeFilter.SHOW_TEXT, null);
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) {
      if (n.parentElement && n.parentElement.closest('.pb')) continue;
      nodes.push(n);
    }
    const sel = window.getSelection();
    let startIdx = 0;
    let startOffset = 0;
    if (sel && sel.rangeCount > 0 && pageEl.contains(sel.getRangeAt(0).endContainer)) {
      const curNode = sel.getRangeAt(0).endContainer;
      const idx = nodes.indexOf(curNode);
      if (idx >= 0) {
        startIdx = idx;
        startOffset = sel.getRangeAt(0).endOffset;
      }
    }
    for (let pass = 0; pass < 2; pass++) {
      const from = pass === 0 ? startIdx : 0;
      const to = pass === 0 ? nodes.length : startIdx + 1;
      for (let i = from; i < to; i++) {
        const tn = nodes[i];
        const off = pass === 0 && i === startIdx ? startOffset : 0;
        const pos = tn.nodeValue.toLowerCase().indexOf(q, off);
        if (pos >= 0) {
          const r = document.createRange();
          r.setStart(tn, pos);
          r.setEnd(tn, pos + findQuery.length);
          sel.removeAllRanges();
          sel.addRange(r);
          lastRangeRef.current = r.cloneRange();
          pageEl.focus();
          setFindMsg('');
          return;
        }
      }
    }
    setFindMsg('No matches found.');
  };
  const replaceAll = () => {
    const pageEl = pageRef.current;
    if (!pageEl || !findQuery) return;
    const walker = document.createTreeWalker(pageEl, NodeFilter.SHOW_TEXT, null);
    let count = 0;
    const re = new RegExp(findQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) {
      if (n.parentElement && n.parentElement.closest('.pb')) continue;
      nodes.push(n);
    }
    nodes.forEach((tn) => {
      const matches = tn.nodeValue.match(re);
      if (matches) {
        count += matches.length;
        tn.nodeValue = tn.nodeValue.replace(re, replaceQuery);
      }
    });
    setFindMsg('Replaced ' + count + ' occurrence' + (count === 1 ? '' : 's') + '.');
    recomputePageBreaks();
    updateStatsAndNotify();
  };
  useEffect(() => {
    syncOverlay();
  }, [selectedImg, syncOverlay]);
  const onPageMouseDown = (e) => {
    const pageEl = pageRef.current;
    if (!pageEl) return;
    let targetImg = null;
    if (e.altKey) {
      const behindImgs = Array.from(pageEl.querySelectorAll('img[data-wrap="behind"]'));
      for (let i = behindImgs.length - 1; i >= 0; i--) {
        const r = behindImgs[i].getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          targetImg = behindImgs[i];
          break;
        }
      }
    }
    if (!targetImg && e.target && e.target.tagName === 'IMG' && pageEl.contains(e.target)) {
      targetImg = e.target;
    }
    if (targetImg) {
      const img = targetImg;
      setSelectedImg(img);
      selectedImgRef.current = img;
      requestAnimationFrame(syncOverlay);
      // Initiate drag-to-move
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const wrapMode = img.getAttribute('data-wrap') || 'inline';
      const startLeft = parseFloat(img.style.left || '0') || 0;
      const startTop = parseFloat(img.style.top || '0') || 0;
      let moved = false;
      const onMove = (ev) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!moved && Math.hypot(dx, dy) < 4) return;
        moved = true;
        if (wrapMode === 'behind' || wrapMode === 'front') {
          const maxLeft = Math.max(0, dims.w - img.offsetWidth);
          const maxTop = Math.max(0, pageEl.scrollHeight - img.offsetHeight);
          img.style.left = Math.max(0, Math.min(maxLeft, Math.round(startLeft + dx))) + 'px';
          img.style.top = Math.max(0, Math.min(maxTop, Math.round(startTop + dy))) + 'px';
          syncOverlay();
        }
      };
      const onUp = (ev) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        if (!moved) return;
        if (wrapMode !== 'behind' && wrapMode !== 'front') {
          if (overlayRef.current) overlayRef.current.style.pointerEvents = 'none';
          const prevPE = img.style.pointerEvents;
          img.style.pointerEvents = 'none';
          const range = getCaretRangeAtPoint(ev.clientX, ev.clientY);
          img.style.pointerEvents = prevPE;
          if (range && pageEl.contains(range.startContainer)) {
            range.insertNode(img);
            if (wrapMode === 'left' || wrapMode === 'right') {
              const pRect = pageEl.getBoundingClientRect();
              const nextMode = ev.clientX < pRect.left + pRect.width / 2 ? 'left' : 'right';
              applyImageWrapStyle(img, nextMode, pageEl);
            }
          }
        }
        recomputePageBreaks();
        syncOverlay();
        updateStatsAndNotify();
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    } else if (!e.target.closest || !e.target.closest('.img-overlay')) {
      setSelectedImg(null);
      setOverlayRect(null);
    }
  };
  const startResizeImg = (dir, e) => {
    e.preventDefault();
    e.stopPropagation();
    const img = selectedImgRef.current;
    if (!img) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = img.getBoundingClientRect().width;
    const startH = img.getBoundingClientRect().height;
    const ratio = startH > 0 ? startW / startH : 1;
    const isCorner = dir.length === 2;
    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      let w = startW;
      let hVal = startH;
      if (dir.includes('e')) w = Math.max(24, startW + dx);
      if (dir.includes('w')) w = Math.max(24, startW - dx);
      if (dir.includes('s')) hVal = Math.max(24, startH + dy);
      if (dir.includes('n')) hVal = Math.max(24, startH - dy);
      if (isCorner) {
        if (Math.abs(dx) >= Math.abs(dy)) hVal = Math.max(24, w / ratio);
        else w = Math.max(24, hVal * ratio);
      }
      img.style.width = Math.round(w) + 'px';
      img.style.height = isCorner
        ? Math.round(hVal) + 'px'
        : dir === 'e' || dir === 'w'
          ? Math.round(startH) + 'px'
          : Math.round(hVal) + 'px';
      syncOverlay();
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      recomputePageBreaks();
      syncOverlay();
      updateStatsAndNotify();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
  const setImgWrapMode = (mode) => {
    const img = selectedImgRef.current;
    const pageEl = pageRef.current;
    if (!img || !pageEl) return;
    applyImageWrapStyle(img, mode, pageEl);
    recomputePageBreaks();
    syncOverlay();
    updateStatsAndNotify();
  };
  const removeSelectedImg = () => {
    const img = selectedImgRef.current;
    if (!img) return;
    const p = img.parentElement;
    img.remove();
    if (p && p.tagName === 'A' && p.childNodes.length === 0) p.remove();
    setSelectedImg(null);
    setOverlayRect(null);
    recomputePageBreaks();
    updateStatsAndNotify();
  };
  const openLinkEditor = () => {
    const img = selectedImgRef.current;
    let existing = '';
    if (img && img.parentElement && img.parentElement.tagName === 'A') {
      existing = img.parentElement.getAttribute('href') || '';
    } else {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && pageRef.current && pageRef.current.contains(sel.anchorNode)) {
        const a =
          sel.anchorNode.nodeType === 1
            ? sel.anchorNode.closest('a')
            : sel.anchorNode.parentElement.closest('a');
        if (a) existing = a.getAttribute('href') || '';
      }
    }
    setLinkUrl(existing);
    setLinkErr('');
    setShowLinkBar((v) => !v);
  };
  const onPagePaste = (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    if (text) {
      document.execCommand('insertText', false, text);
      recomputePageBreaks();
      updateStatsAndNotify();
    }
  };
  const preventFocusLoss = (e) => e.preventDefault();
  return (
    <div className="sheet-workspace">
      {' '}
      // Ribbon
      <div className="ribbon" role="toolbar" aria-label="Document formatting">
        <div className="ribbon-row">
          <button
            type="button"
            className="icon-btn"
            aria-label="Undo"
            title="Undo"
            onMouseDown={preventFocusLoss}
            onClick={() => exec('undo')}
          >
            <SvgIcon d={['M3 7v6h6', 'M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13']} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Redo"
            title="Redo"
            onMouseDown={preventFocusLoss}
            onClick={() => exec('redo')}
          >
            <SvgIcon d={['M21 7v6h-6', 'M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7']} />
          </button>
          <span className="r-sep" />
          <select
            className="r-select"
            aria-label="Font family"
            defaultValue="Arial"
            onChange={(e) => exec('fontName', e.target.value)}
          >
            <option value="Arial">Arial</option>
            <option value="Georgia">Georgia</option>
            <option value="Times New Roman">Times New Roman</option>
            <option value="Courier New">Courier New</option>
            <option value="Verdana">Verdana</option>
            <option value={'"Noto Naskh Arabic", serif'}>Urdu Naskh</option>
            <option value={'"Noto Nastaliq Urdu", serif'}>Urdu Nastaliq</option>
          </select>
          <select
            className="r-select"
            aria-label="Font size"
            defaultValue="14px"
            onChange={(e) => applyFontSize(e.target.value)}
          >
            {['10px', '11px', '12px', '14px', '16px', '18px', '20px', '24px', '28px', '36px', '48px'].map(
              (sz) => (
                <option key={sz} value={sz}>
                  {sz.replace('px', '')}
                </option>
              )
            )}
          </select>
          <select
            className="r-select"
            aria-label="Paragraph style"
            value={cmdState.blockTag || 'p'}
            onChange={(e) => exec('formatBlock', e.target.value)}
          >
            <option value="p">Normal</option>
            <option value="h1">Heading 1</option>
            <option value="h2">Heading 2</option>
            <option value="h3">Heading 3</option>
          </select>
          <span className="r-sep" />
          <button
            type="button"
            className="icon-btn"
            aria-label="Bold"
            aria-pressed={!!cmdState.bold}
            onMouseDown={preventFocusLoss}
            onClick={() => exec('bold')}
          >
            <strong>B</strong>
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Italic"
            aria-pressed={!!cmdState.italic}
            onMouseDown={preventFocusLoss}
            onClick={() => exec('italic')}
          >
            <em>I</em>
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Underline"
            aria-pressed={!!cmdState.underline}
            onMouseDown={preventFocusLoss}
            onClick={() => exec('underline')}
          >
            <span
              style={{
                textDecoration: 'underline'
              }}
            >
              U
            </span>
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Strikethrough"
            aria-pressed={!!cmdState.strikeThrough}
            onMouseDown={preventFocusLoss}
            onClick={() => exec('strikeThrough')}
          >
            <span
              style={{
                textDecoration: 'line-through'
              }}
            >
              S
            </span>
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Subscript"
            aria-pressed={!!cmdState.subscript}
            onMouseDown={preventFocusLoss}
            onClick={() => exec('subscript')}
          >
            X₂
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Superscript"
            aria-pressed={!!cmdState.superscript}
            onMouseDown={preventFocusLoss}
            onClick={() => exec('superscript')}
          >
            X²
          </button>
          <span className="r-sep" />
          <label className="color-btn-wrap" title="Text colour">
            <span
              style={{
                fontSize: '11px',
                marginRight: '2px'
              }}
            >
              A
            </span>
            <input
              type="color"
              className="color-input-hidden"
              aria-label="Text colour"
              value={textColor}
              onChange={(e) => {
                setTextColor(e.target.value);
                exec('foreColor', e.target.value);
              }}
            />
          </label>
          <label className="color-btn-wrap" title="Highlight colour">
            <span
              style={{
                fontSize: '11px',
                marginRight: '2px'
              }}
            >
              HL
            </span>
            <input
              type="color"
              className="color-input-hidden"
              aria-label="Highlight colour"
              value={hiliteColor}
              onChange={(e) => {
                setHiliteColor(e.target.value);
                exec('hiliteColor', e.target.value);
              }}
            />
          </label>
          <button
            type="button"
            className="icon-btn"
            aria-label="Clear highlight"
            title="Clear highlight"
            onMouseDown={preventFocusLoss}
            onClick={() => exec('hiliteColor', 'transparent')}
          >
            ∅
          </button>
        </div>
        <div className="ribbon-row">
          <button
            type="button"
            className="icon-btn"
            aria-label="Align left"
            aria-pressed={!!cmdState.justifyLeft}
            onMouseDown={preventFocusLoss}
            onClick={() => exec('justifyLeft')}
          >
            <SvgIcon d={['M3 6h18', 'M3 12h12', 'M3 18h16']} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Align center"
            aria-pressed={!!cmdState.justifyCenter}
            onMouseDown={preventFocusLoss}
            onClick={() => exec('justifyCenter')}
          >
            <SvgIcon d={['M3 6h18', 'M6 12h12', 'M4 18h16']} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Align right"
            aria-pressed={!!cmdState.justifyRight}
            onMouseDown={preventFocusLoss}
            onClick={() => exec('justifyRight')}
          >
            <SvgIcon d={['M3 6h18', 'M9 12h12', 'M5 18h16']} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Justify"
            aria-pressed={!!cmdState.justifyFull}
            onMouseDown={preventFocusLoss}
            onClick={() => exec('justifyFull')}
          >
            <SvgIcon d={['M3 6h18', 'M3 12h18', 'M3 18h18']} />
          </button>
          <span className="r-sep" />
          <button
            type="button"
            className="icon-btn"
            aria-label="Bulleted list"
            aria-pressed={!!cmdState.insertUnorderedList}
            onMouseDown={preventFocusLoss}
            onClick={() => exec('insertUnorderedList')}
          >
            • List
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Numbered list"
            aria-pressed={!!cmdState.insertOrderedList}
            onMouseDown={preventFocusLoss}
            onClick={() => exec('insertOrderedList')}
          >
            1. List
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Decrease indent"
            onMouseDown={preventFocusLoss}
            onClick={() => exec('outdent')}
          >
            ⇤
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Increase indent"
            onMouseDown={preventFocusLoss}
            onClick={() => exec('indent')}
          >
            ⇥
          </button>
          <select
            className="r-select"
            aria-label="Line spacing"
            value={cmdState.lineSpacing || '1.5'}
            onChange={(e) => applyLineSpacing(e.target.value)}
          >
            <option value="1.0">1.0×</option>
            <option value="1.15">1.15×</option>
            <option value="1.5">1.5×</option>
            <option value="2.0">2.0×</option>
          </select>
          <span className="r-sep" />
          <button
            type="button"
            className="icon-btn"
            aria-label="Insert 3 by 3 table"
            onMouseDown={preventFocusLoss}
            onClick={insertTable3x3}
          >
            Table 3×3
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Add row"
            onMouseDown={preventFocusLoss}
            onClick={() => modifyTable('addRow')}
          >
            +Row
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Add column"
            onMouseDown={preventFocusLoss}
            onClick={() => modifyTable('addCol')}
          >
            +Col
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Delete row"
            onMouseDown={preventFocusLoss}
            onClick={() => modifyTable('delRow')}
          >
            −Row
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Delete column"
            onMouseDown={preventFocusLoss}
            onClick={() => modifyTable('delCol')}
          >
            −Col
          </button>
          <span className="r-sep" />
          <label
            className="icon-btn"
            role="button"
            tabIndex={0}
            aria-label="Insert image"
            onMouseDown={preventFocusLoss}
          >
            Image
            <input
              type="file"
              accept="image/*"
              style={{
                display: 'none'
              }}
              onChange={handleImageUpload}
            />
          </label>
          <button
            type="button"
            className="icon-btn"
            aria-label="Insert link"
            aria-pressed={showLinkBar}
            onMouseDown={preventFocusLoss}
            onClick={openLinkEditor}
          >
            Link
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Insert page break"
            onMouseDown={preventFocusLoss}
            onClick={insertPageBreak}
          >
            Page Break
          </button>
          <span className="r-sep" />
          <select
            className="r-select"
            aria-label="Page size"
            value={pageSize}
            onChange={(e) => {
              const next = e.target.value;
              setPageSize(next);
              requestAnimationFrame(() => {
                recomputePageBreaks();
                updateStatsAndNotify(next, orientation);
              });
            }}
          >
            <option value="A4">A4</option>
            <option value="Letter">Letter</option>
          </select>
          <select
            className="r-select"
            aria-label="Page orientation"
            value={orientation}
            onChange={(e) => {
              const next = e.target.value;
              setOrientation(next);
              requestAnimationFrame(() => {
                recomputePageBreaks();
                updateStatsAndNotify(pageSize, next);
              });
            }}
          >
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
          <span className="r-sep" />
          <button
            type="button"
            className="icon-btn"
            aria-label="Find and replace"
            aria-pressed={showFindBar}
            onMouseDown={preventFocusLoss}
            onClick={() => setShowFindBar((v) => !v)}
          >
            Find
          </button>
        </div>
      </div>
      {
        // Link Bar
        showLinkBar ? (
          <form className="subbar" onSubmit={applyLink}>
            <label
              style={{
                fontSize: '12px',
                fontWeight: 500
              }}
            >
              Address:
            </label>
            <input
              type="text"
              className="subbar-input"
              placeholder="https://example.com or mailto:..."
              value={linkUrl}
              data-skip-urdu="true"
              aria-label="Link address"
              onChange={(e) => setLinkUrl(e.target.value)}
            />
            <button type="submit" className="btn primary">
              Apply link
            </button>
            <button type="button" className="btn" onClick={removeLink}>
              Remove link
            </button>
            <button type="button" className="btn" onClick={() => setShowLinkBar(false)}>
              Cancel
            </button>
            {linkErr ? (
              <span
                style={{
                  color: 'var(--danger)',
                  fontSize: '12px'
                }}
              >
                {linkErr}
              </span>
            ) : null}
          </form>
        ) : null
      }
      {
        // Find & Replace Bar
        showFindBar ? (
          <div className="subbar">
            <input
              type="text"
              className="subbar-input"
              placeholder={'Find text…'}
              aria-label="Find text"
              value={findQuery}
              onChange={(e) => setFindQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  findNext();
                }
              }}
            />
            <input
              type="text"
              className="subbar-input"
              placeholder={'Replace with…'}
              aria-label="Replace with"
              value={replaceQuery}
              onChange={(e) => setReplaceQuery(e.target.value)}
            />
            <button type="button" className="btn" onClick={findNext}>
              Find next
            </button>
            <button type="button" className="btn" onClick={replaceAll}>
              Replace all
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setShowFindBar(false);
                setFindMsg('');
              }}
            >
              Close
            </button>
            {findMsg ? (
              <span
                style={{
                  fontSize: '12px',
                  color: 'var(--text-muted)'
                }}
              >
                {findMsg}
              </span>
            ) : null}
          </div>
        ) : null
      }{' '}
      // Document Canvas
      <div className="doc-scroll" ref={scrollRef}>
        <div
          className="page-stage"
          style={{
            width: dims.w + 'px'
          }}
        >
          <div
            ref={pageRef}
            className="page"
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label="Document editor"
            style={{
              width: dims.w + 'px',
              minHeight: dims.h + 'px',
              '--page-h': dims.h + 'px'
            }}
            onMouseDown={onPageMouseDown}
            onInput={() => {
              recomputePageBreaks();
              syncOverlay();
              updateStatsAndNotify();
            }}
            onPaste={onPagePaste}
            onKeyUp={refreshCommandStates}
          />
          {
            // Image Selection Overlay
            selectedImg && overlayRect ? (
              <div
                ref={overlayRef}
                className="img-overlay"
                style={{
                  left: overlayRect.left + 'px',
                  top: overlayRect.top + 'px',
                  width: overlayRect.width + 'px',
                  height: overlayRect.height + 'px'
                }}
              >
                <div className="img-toolbar" onMouseDown={preventFocusLoss}>
                  {['inline', 'left', 'right', 'behind', 'front'].map((mode) => {
                    const labels = {
                      inline: 'In line',
                      left: 'Wrap left',
                      right: 'Wrap right',
                      behind: 'Behind text',
                      front: 'In front'
                    };
                    const cur = selectedImg.getAttribute('data-wrap') || 'inline';
                    return (
                      <button
                        key={mode}
                        type="button"
                        className={'icon-btn' + (cur === mode ? ' active' : '')}
                        aria-pressed={cur === mode}
                        onClick={() => setImgWrapMode(mode)}
                      >
                        {labels[mode]}
                      </button>
                    );
                  })}
                  <span className="r-sep" />
                  <button
                    type="button"
                    className="icon-btn"
                    style={{
                      color: 'var(--danger)'
                    }}
                    onClick={removeSelectedImg}
                  >
                    Remove
                  </button>
                </div>
                {['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((dir) => (
                  <div
                    key={dir}
                    className={'img-handle ' + dir}
                    onPointerDown={(e) => startResizeImg(dir, e)}
                  />
                ))}
              </div>
            ) : null
          }
        </div>
      </div>{' '}
      // Status Bar
      <div className="status-bar">
        <span>
          {stats.words +
            ' words · ' +
            stats.chars +
            ' characters · ' +
            stats.pages +
            ' page' +
            (stats.pages === 1 ? '' : 's') +
            ' (approx)'}
        </span>
        <span>
          {pageSize +
            ' · ' +
            (orientation === 'landscape' ? 'Landscape' : 'Portrait') +
            ' (' +
            dims.w +
            '×' +
            dims.h +
            ')'}
        </span>
      </div>
    </div>
  );
}
