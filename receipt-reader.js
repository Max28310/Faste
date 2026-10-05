/* Lecture locale et proposition à vérifier : aucune écriture comptable automatique. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FasteReceipt = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function parse(text) {
    const lines = String(text).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    function amount(pattern) {
      const line = [...lines].reverse().find(s => pattern.test(s)); if (!line) return null;
      const clean = line.replace(/\d+(?:[.,]\d+)?\s*%/g, '');
      const tokens = clean.match(/\d[\d\s\u00a0.,]*\d|\d/g); if (!tokens?.length) return null;
      let value = tokens[tokens.length - 1].replace(/[\s\u00a0]/g, '');
      const separator = Math.max(value.lastIndexOf(','), value.lastIndexOf('.'));
      if (separator >= 0 && value.length - separator - 1 <= 2) value = value.slice(0, separator).replace(/[.,]/g, '') + '.' + value.slice(separator + 1);
      else value = value.replace(/[.,]/g, '');
      const result = Number(value); return Number.isFinite(result) && result >= 0 ? Math.round(result * 100) / 100 : null;
    }
    const ht = amount(/(?:total|montant|base|net).*\bH\s*\.?\s*T\b|total hors taxes/i);
    const vat = amount(/(?:total|montant)\s*(?:de\s*(?:la\s*)?)?T\s*\.?\s*V\s*\.?\s*A\b|^TVA\s*(?:[:€]|\d)/i);
    const ttc = amount(/(?:total|montant|net|a payer|à payer).*\bT\s*\.?\s*T\s*\.?\s*C\b|(?:total|net)\s*(?:à|a)\s*payer/i);
    const date = String(text).match(/\b(\d{2})[/.\-](\d{2})[/.\-](20\d{2})\b/);
    let document_date = null;
    if (date) { const iso = date[3] + '-' + date[2] + '-' + date[1]; const d = new Date(iso + 'T12:00:00Z'); if (!Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso) document_date = iso; }
    const reference = String(text).match(/(?:facture|ticket)\s*(?:n[°o.]|num[ée]ro|:|#)\s*:?\s*([A-Z0-9][A-Z0-9_/.\-]*)/i)?.[1] || null;
    const supplier = lines.find(s => s.length > 2 && s.length < 80 && !/^(facture|ticket|reçu|devis|date|total)\b/i.test(s) && !/^[\d\s.,€]+$/.test(s)) || null;
    const coherent = ht != null && vat != null && ttc != null ? Math.abs(Math.round((ht + vat - ttc) * 100)) <= 2 : null;
    return { supplier, reference, document_date, ht, vat, ttc, coherent };
  }
  async function read(file, progress = () => {}) {
    if (!file || file.size > 10485760) throw new Error('Choisissez un justificatif de 10 Mo maximum.');
    let worker;
    const recognize = async image => {
      if (!worker) worker = await Tesseract.createWorker('fra', 1, { workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js', corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1', langPath: 'https://tessdata.projectnaptha.com/4.0.0', logger: m => progress(m.status === 'recognizing text' ? `Lecture ${Math.round(m.progress * 100)} %` : 'Chargement du moteur de lecture…') });
      return (await worker.recognize(image)).data.text;
    };
    try {
      let text = '';
      if (file.type === 'application/pdf') {
        const pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs'); pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs';
        const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }); const pdf = await task.promise;
        try {
          if (pdf.numPages > 20) throw new Error('La lecture automatique est limitée à 20 pages. Vous pouvez joindre ce PDF et saisir les montants manuellement.');
          for (let i = 1; i <= pdf.numPages; i++) {
            progress(`Lecture page ${i}/${pdf.numPages}…`); const page = await pdf.getPage(i), content = await page.getTextContent();
            let pageText = '', previousY = null;
            for (const item of content.items) { const y = item.transform?.[5]; if (previousY != null && Math.abs(y - previousY) > 2) pageText += '\n'; pageText += item.str + (item.hasEOL ? '\n' : ' '); previousY = y; }
            if (pageText.trim().length < 30) { const viewport = page.getViewport({ scale: 1.5 }), canvas = document.createElement('canvas'); canvas.width = viewport.width; canvas.height = viewport.height; await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise; pageText = await recognize(canvas); canvas.width = canvas.height = 0; }
            text += pageText + '\n'; page.cleanup();
          }
        } finally { await pdf.destroy(); }
      } else if (['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) text = await recognize(file);
      else throw new Error('Lecture : utilisez un PDF, JPEG, PNG ou WebP. Le fichier peut toujours être joint sans lecture.');
      return { ...parse(text), text };
    } finally { if (worker) await worker.terminate(); }
  }
  return { parse, read };
});
