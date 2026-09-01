export const LIB_URLS = {
  html2canvas: {
    url: 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
    global: 'html2canvas'
  },
  jspdf: {
    url: 'https://cdn.jsdelivr.net/npm/jspdf@3.0.3/dist/jspdf.umd.min.js',
    global: 'jspdf'
  },
  docx: {
    url: 'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js',
    global: 'docx'
  },
  exceljs: {
    url: 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js',
    global: 'ExcelJS'
  }
};

export const scriptPromises = {};

export function loadExportLib(key) {
  const cfg = LIB_URLS[key];
  if (!cfg) return Promise.reject(new Error('Unknown library: ' + key));
  if (window[cfg.global]) return Promise.resolve(window[cfg.global]);
  if (scriptPromises[key]) return scriptPromises[key];
  scriptPromises[key] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = cfg.url;
    s.async = true;
    s.onload = () => {
      if (window[cfg.global]) resolve(window[cfg.global]);
      else reject(new Error('Failed to initialize ' + key));
    };
    s.onerror = () => {
      delete scriptPromises[key];
      reject(new Error('Failed to load ' + key + ' from jsDelivr'));
    };
    document.head.appendChild(s);
  });
  return scriptPromises[key];
}
