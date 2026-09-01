export async function triggerDownload(filename, dataOrBlob, mimeType) {
  let blob;
  if (dataOrBlob instanceof Blob) {
    blob = dataOrBlob;
  } else if (dataOrBlob instanceof Uint8Array || dataOrBlob instanceof ArrayBuffer) {
    blob = new Blob([dataOrBlob], {
      type: mimeType || 'application/octet-stream'
    });
  } else {
    blob = new Blob([String(dataOrBlob)], {
      type: mimeType || 'text/plain;charset=utf-8'
    });
  }
  if (window.claude && typeof window.claude.use === 'function') {
    try {
      const downloads = await window.claude.use('downloads');
      if (downloads && typeof downloads.save === 'function') {
        const ab = await blob.arrayBuffer();
        await downloads.save({
          filename,
          data: new Uint8Array(ab)
        });
        return;
      }
    } catch (e) {}
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 500);
}

export function sanitizeFilename(title, ext) {
  const base = (title || 'Untitled').replace(/[\\/:*?"<>|]/g, '_').trim() || 'Untitled';
  return base + '.' + ext;
}

export function cssColorToHex(cssColor) {
  if (!cssColor || cssColor === 'transparent' || cssColor === 'rgba(0, 0, 0, 0)') return null;
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(cssColor);
  if (m) {
    if (m[4] !== undefined && parseFloat(m[4]) === 0) return null;
    const hex = (n) => Number(n).toString(16).padStart(2, '0').toUpperCase();
    return hex(m[1]) + hex(m[2]) + hex(m[3]);
  }
  if (/^#[0-9a-f]{6}$/i.test(cssColor)) return cssColor.slice(1).toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(cssColor)) {
    return (cssColor[1] + cssColor[1] + cssColor[2] + cssColor[2] + cssColor[3] + cssColor[3]).toUpperCase();
  }
  return null;
}

export function hasRtlChars(str) {
  return /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(str || '');
}

export function dataUrlToUint8(dataUrl) {
  const parts = String(dataUrl).split(',');
  if (parts.length < 2) return null;
  const bstr = atob(parts[1]);
  const arr = new Uint8Array(bstr.length);
  for (let i = 0; i < bstr.length; i++) arr[i] = bstr.charCodeAt(i);
  const mime = (parts[0].match(/data:([^;]+)/) || [])[1] || 'image/png';
  let type = 'png';
  if (mime.includes('jpeg') || mime.includes('jpg')) type = 'jpg';
  else if (mime.includes('gif')) type = 'gif';
  else if (mime.includes('bmp')) type = 'bmp';
  return {
    data: arr,
    type
  };
}
