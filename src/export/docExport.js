import { loadExportLib } from './loadLibs.js';
import { cssColorToHex, dataUrlToUint8, hasRtlChars, sanitizeFilename, triggerDownload } from './utils.js';

export async function exportDocToDocx(pageEl, pageConfig, title) {
  const docx = await loadExportLib('docx');
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    AlignmentType,
    ExternalHyperlink,
    ImageRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
    BorderStyle,
    PageBreak,
    PageOrientation,
    TextWrappingType,
    HorizontalPositionRelativeFrom,
    VerticalPositionRelativeFrom,
    LevelFormat
  } = docx;
  function buildImageRun(imgEl) {
    const src = imgEl.getAttribute('src') || '';
    const parsed = dataUrlToUint8(src);
    if (!parsed) return null;
    const rect = imgEl.getBoundingClientRect();
    const w = Math.max(16, Math.round(rect.width || imgEl.offsetWidth || 200));
    const hVal = Math.max(16, Math.round(rect.height || imgEl.offsetHeight || 150));
    const wrap = imgEl.getAttribute('data-wrap') || 'inline';
    const opts = {
      data: parsed.data,
      transformation: {
        width: w,
        height: hVal
      }
    };
    if (parsed.type && parsed.type !== 'svg') opts.type = parsed.type;
    if (wrap !== 'inline') {
      const leftPx = parseFloat(imgEl.style.left || '0') || 0;
      const topPx = parseFloat(imgEl.style.top || '0') || 0;
      opts.floating = {
        horizontalPosition: {
          relative:
            wrap === 'left' || wrap === 'right'
              ? HorizontalPositionRelativeFrom.MARGIN
              : HorizontalPositionRelativeFrom.PAGE,
          offset: wrap === 'right' ? 4000000 : wrap === 'left' ? 0 : Math.round(leftPx * 9525)
        },
        verticalPosition: {
          relative:
            wrap === 'left' || wrap === 'right'
              ? VerticalPositionRelativeFrom.PARAGRAPH
              : VerticalPositionRelativeFrom.PAGE,
          offset: wrap === 'left' || wrap === 'right' ? 0 : Math.round(topPx * 9525)
        },
        wrap:
          wrap === 'left' || wrap === 'right'
            ? {
                type: TextWrappingType.SQUARE
              }
            : {
                type: TextWrappingType.NONE
              },
        behindDocument: wrap === 'behind'
      };
    }
    try {
      return new ImageRun(opts);
    } catch (e) {
      return null;
    }
  }
  function extractRunsFromNode(node, isRtlPara) {
    const runs = [];
    if (node.nodeType === 3) {
      const txt = node.nodeValue.replace(/\u200B/g, '');
      if (!txt) return runs;
      const parentEl = node.parentElement;
      const cs = parentEl ? window.getComputedStyle(parentEl) : null;
      const fw = cs ? parseInt(cs.fontWeight, 10) : 400;
      const bold = cs ? cs.fontWeight === 'bold' || fw >= 600 : false;
      const italics = cs ? cs.fontStyle === 'italic' : false;
      const tdec = cs ? cs.textDecorationLine || cs.textDecoration || '' : '';
      const underline = tdec.includes('underline') ? {} : undefined;
      const strike = tdec.includes('line-through');
      const vAlign = cs ? cs.verticalAlign : '';
      const subScript = vAlign === 'sub' || !!(parentEl && parentEl.closest('sub'));
      const superScript = vAlign === 'super' || !!(parentEl && parentEl.closest('sup'));
      const colorHex = cs ? cssColorToHex(cs.color) : null;
      const bgHex = cs ? cssColorToHex(cs.backgroundColor) : null;
      const font = cs ? cs.fontFamily.split(',')[0].replace(/['"]/g, '').trim() : 'Arial';
      const fontSizePx = cs ? parseFloat(cs.fontSize) : 14;
      const sizeHalfPt = Math.max(12, Math.round(fontSizePx * 0.75 * 2));
      const rtlRun = isRtlPara || hasRtlChars(txt);
      const runOpts = {
        text: txt,
        bold,
        italics,
        strike,
        subScript,
        superScript,
        font,
        size: sizeHalfPt
      };
      if (underline) runOpts.underline = underline;
      if (colorHex && colorHex !== '000000') runOpts.color = colorHex;
      if (bgHex && bgHex !== 'FFFFFF')
        runOpts.shading = {
          fill: bgHex
        };
      if (rtlRun) runOpts.rightToLeft = true;
      runs.push(new TextRun(runOpts));
      return runs;
    }
    if (node.nodeType !== 1) return runs;
    const tag = node.tagName;
    if (tag === 'BR') {
      runs.push(
        new TextRun({
          break: 1
        })
      );
      return runs;
    }
    if (tag === 'IMG') {
      const ir = buildImageRun(node);
      if (ir) runs.push(ir);
      return runs;
    }
    if (tag === 'A') {
      const href = node.getAttribute('href') || '';
      const childRuns = [];
      Array.from(node.childNodes).forEach((ch) => childRuns.push(...extractRunsFromNode(ch, isRtlPara)));
      if (href && childRuns.length > 0) {
        runs.push(
          new ExternalHyperlink({
            children: childRuns,
            link: href
          })
        );
      } else {
        runs.push(...childRuns);
      }
      return runs;
    }
    Array.from(node.childNodes).forEach((ch) => runs.push(...extractRunsFromNode(ch, isRtlPara)));
    return runs;
  }
  function mapAlignment(el) {
    const cs = window.getComputedStyle(el);
    const ta = cs.textAlign;
    if (ta === 'center') return AlignmentType.CENTER;
    if (ta === 'right' || ta === 'end') return AlignmentType.RIGHT;
    if (ta === 'justify') return AlignmentType.JUSTIFIED;
    return AlignmentType.LEFT;
  }
  function buildParagraph(el, extraOpts) {
    const cs = window.getComputedStyle(el);
    const txt = el.innerText || '';
    const isRtl = el.getAttribute('dir') === 'rtl' || cs.direction === 'rtl' || hasRtlChars(txt);
    const lhPx = parseFloat(cs.lineHeight);
    const fsPx = parseFloat(cs.fontSize) || 14;
    const lineMult = !isNaN(lhPx) ? Math.round((lhPx / fsPx) * 240) : 360;
    const opts = Object.assign(
      {
        children: extractRunsFromNode(el, isRtl),
        alignment: mapAlignment(el),
        bidirectional: isRtl,
        spacing: {
          line: lineMult,
          after: 120
        }
      },
      extraOpts || {}
    );
    return new Paragraph(opts);
  }
  function buildTable(tableEl) {
    const borderSpec = {
      style: BorderStyle.SINGLE,
      size: 6,
      color: '9CA3AF'
    };
    const borders = {
      top: borderSpec,
      bottom: borderSpec,
      left: borderSpec,
      right: borderSpec
    };
    const rows = Array.from(tableEl.rows).map(
      (tr) =>
        new TableRow({
          children: Array.from(tr.cells).map((td) => {
            const children = [];
            Array.from(td.childNodes).forEach((ch) => {
              if (ch.nodeType === 1 && ['P', 'H1', 'H2', 'H3', 'DIV'].includes(ch.tagName)) {
                children.push(buildParagraph(ch));
              } else {
                const r = extractRunsFromNode(ch, hasRtlChars(ch.textContent));
                if (r.length)
                  children.push(
                    new Paragraph({
                      children: r
                    })
                  );
              }
            });
            if (children.length === 0)
              children.push(
                new Paragraph({
                  children: []
                })
              );
            return new TableCell({
              children,
              borders
            });
          })
        })
    );
    return new Table({
      rows,
      width: {
        size: 100,
        type: WidthType.PERCENTAGE
      }
    });
  }
  const children = [];
  function walkBlock(node) {
    if (node.nodeType === 3) {
      if (node.nodeValue.trim()) {
        children.push(
          new Paragraph({
            children: extractRunsFromNode(node, hasRtlChars(node.nodeValue))
          })
        );
      }
      return;
    }
    if (node.nodeType !== 1) return;
    if (node.classList.contains('pb')) {
      children.push(
        new Paragraph({
          children: [new PageBreak()]
        })
      );
      return;
    }
    const tag = node.tagName;
    if (tag === 'H1') {
      children.push(
        buildParagraph(node, {
          heading: HeadingLevel.HEADING_1
        })
      );
      return;
    }
    if (tag === 'H2') {
      children.push(
        buildParagraph(node, {
          heading: HeadingLevel.HEADING_2
        })
      );
      return;
    }
    if (tag === 'H3') {
      children.push(
        buildParagraph(node, {
          heading: HeadingLevel.HEADING_3
        })
      );
      return;
    }
    if (tag === 'UL' || tag === 'OL') {
      const ref = tag === 'UL' ? 'deskwork-bullets' : 'deskwork-numbers';
      Array.from(node.children).forEach((li) => {
        if (li.tagName === 'LI')
          children.push(
            buildParagraph(li, {
              numbering: {
                reference: ref,
                level: 0
              }
            })
          );
      });
      return;
    }
    if (tag === 'TABLE') {
      children.push(buildTable(node));
      return;
    }
    if (tag === 'IMG') {
      const ir = buildImageRun(node);
      if (ir)
        children.push(
          new Paragraph({
            children: [ir]
          })
        );
      return;
    }
    children.push(buildParagraph(node));
  }
  Array.from(pageEl.childNodes).forEach(walkBlock);
  if (children.length === 0)
    children.push(
      new Paragraph({
        children: []
      })
    );
  const isLetter = pageConfig.pageSize === 'Letter';
  const baseW = isLetter ? 12240 : 11906;
  const baseH = isLetter ? 15840 : 16838;
  const isLand = pageConfig.orientation === 'landscape';
  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'deskwork-bullets',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '•',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: {
                    left: 720,
                    hanging: 360
                  }
                }
              }
            }
          ]
        },
        {
          reference: 'deskwork-numbers',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: {
                    left: 720,
                    hanging: 360
                  }
                }
              }
            }
          ]
        }
      ]
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: isLand ? baseH : baseW,
              height: isLand ? baseW : baseH,
              orientation: isLand ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT
            },
            margin: {
              top: 1440,
              right: 1440,
              bottom: 1440,
              left: 1440
            }
          }
        },
        children
      }
    ]
  });
  const blob = await Packer.toBlob(doc);
  await triggerDownload(sanitizeFilename(title, 'docx'), blob);
}

export async function renderPageToCanvas(pageEl) {
  const html2canvas = await loadExportLib('html2canvas');
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-99999px';
  host.style.top = '0';
  host.style.background = '#ffffff';
  host.style.zIndex = '-9999';
  const clone = pageEl.cloneNode(true);
  clone.removeAttribute('contenteditable');
  clone.style.backgroundImage = 'none';
  clone.style.boxShadow = 'none';
  clone.querySelectorAll('.pb').forEach((pb) => {
    pb.style.borderTopColor = 'transparent';
    const sp = pb.querySelector('span');
    if (sp) sp.style.visibility = 'hidden';
  });
  host.appendChild(clone);
  document.body.appendChild(host);
  try {
    const hPx = Math.max(clone.scrollHeight, clone.offsetHeight);
    let scale = Math.min(2, window.devicePixelRatio || 2);
    if (hPx * scale > 14000) scale = Math.max(0.5, 14000 / hPx);
    const canvas = await html2canvas(clone, {
      scale,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false
    });
    return {
      canvas,
      scale
    };
  } finally {
    document.body.removeChild(host);
  }
}

export async function exportDocToPdf(pageEl, dims, pageConfig, title) {
  const jspdfMod = await loadExportLib('jspdf');
  const { jsPDF } = jspdfMod;
  const { canvas, scale } = await renderPageToCanvas(pageEl);
  const pageW = dims.w;
  const pageH = dims.h;
  const sliceH = Math.round(pageH * scale);
  const totalPages = Math.max(1, Math.ceil(canvas.height / sliceH));
  const pdf = new jsPDF({
    orientation: pageConfig.orientation === 'landscape' ? 'landscape' : 'portrait',
    unit: 'px',
    format: [pageW, pageH],
    hotfixes: ['px_scaling']
  });
  for (let p = 0; p < totalPages; p++) {
    const sy = p * sliceH;
    const sh = Math.min(sliceH, canvas.height - sy);
    if (sh <= 0) break;
    const tmp = document.createElement('canvas');
    tmp.width = canvas.width;
    tmp.height = sliceH;
    const ctx = tmp.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, tmp.width, tmp.height);
    ctx.drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh);
    if (p > 0) pdf.addPage([pageW, pageH], pageConfig.orientation === 'landscape' ? 'landscape' : 'portrait');
    pdf.addImage(tmp.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pageW, pageH);
  }
  const blob = pdf.output('blob');
  await triggerDownload(sanitizeFilename(title, 'pdf'), blob);
}

export async function exportDocToJpg(pageEl, title) {
  const { canvas } = await renderPageToCanvas(pageEl);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.92));
  await triggerDownload(sanitizeFilename(title, 'jpg'), blob);
}

export async function exportDocToHtml(pageEl, dims, title) {
  const clone = pageEl.cloneNode(true);
  clone.removeAttribute('contenteditable');
  clone.querySelectorAll('.pb').forEach((pb) => {
    pb.style.height = '1px';
    pb.style.pageBreakAfter = 'always';
    pb.innerHTML = '';
  });
  const html =
    '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8" />\n<title>' +
    String(title || 'Document').replace(/[<>&"]/g, '') +
    '</title>\n<style>body{margin:0;padding:32px;background:#f1f3f5;font-family:Arial,sans-serif;}.doc{width:' +
    dims.w +
    'px;margin:0 auto;background:#fff;padding:96px;box-sizing:border-box;color:#111827;line-height:1.5;}p,h1,h2,h3,li,div{unicode-bidi:plaintext;}table{border-collapse:collapse;width:100%;}td,th{border:1px solid #9ca3af;padding:6px 8px;}</style>\n</head>\n<body><div class="doc">' +
    clone.innerHTML +
    '</div></body></html>';
  await triggerDownload(sanitizeFilename(title, 'html'), html, 'text/html;charset=utf-8');
}
