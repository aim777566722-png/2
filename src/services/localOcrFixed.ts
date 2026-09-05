import { createWorker, PSM } from 'tesseract.js';

type Word = { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } };
let workerPromise: ReturnType<typeof createWorker> | null = null;

const wait = <T,>(promise: Promise<T>, ms: number, label: string) => new Promise<T>((resolve, reject) => {
  const timer = window.setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  promise.then(value => { window.clearTimeout(timer); resolve(value); }, error => { window.clearTimeout(timer); reject(error); });
});

function getWorker() {
  if (!workerPromise) {
    workerPromise = wait(
      createWorker('ara+eng', 1, {
        logger: () => undefined,
        workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js',
        corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0',
        langPath: 'https://cdn.jsdelivr.net/gh/naptha/tessdata@gh-pages/4.0.0',
        cachePath: 'purchasemate-ocr', cacheMethod: 'write', gzip: true, workerBlobURL: true,
      }).then(async worker => {
        await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_COLUMN, preserve_interword_spaces: '1', user_defined_dpi: '300' });
        return worker;
      }),
      150000,
      'تشغيل محرك OCR المحلي',
    ).catch(error => { workerPromise = null; throw error; });
  }
  return workerPromise;
}

function clean(value: string) {
  return String(value || '').replace(/[\u0000-\u001F]/g, '').replace(/[\u064B-\u065F\u0670]/g, '').replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '').replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/\s+/g, ' ').trim();
}

function isArabic(value: string) {
  const arabic = (value.match(/[\u0600-\u06FF]/g) || []).length;
  const latin = (value.match(/[A-Za-z]/g) || []).length;
  return arabic > 0 && arabic >= latin;
}

function buildCell(words: Word[]) {
  const text = words.map(word => word.text).join(' ');
  return [...words].sort((a, b) => isArabic(text) ? b.bbox.x0 - a.bbox.x0 : a.bbox.x0 - b.bbox.x0).map(word => clean(word.text)).filter(Boolean).join(' ');
}

function buildLayout(words: Word[]) {
  const usable = words.filter(word => word.text.trim() && Number.isFinite(word.confidence) && word.confidence >= 18);
  if (!usable.length) return '';
  const heights = usable.map(word => Math.max(1, word.bbox.y1 - word.bbox.y0)).sort((a, b) => a - b);
  const tolerance = Math.max(7, (heights[Math.floor(heights.length / 2)] || 20) * 0.7);
  const rows: Word[][] = [];
  for (const word of usable) {
    const y = (word.bbox.y0 + word.bbox.y1) / 2;
    let row = rows.find(candidate => {
      const avg = candidate.reduce((sum, item) => sum + (item.bbox.y0 + item.bbox.y1) / 2, 0) / candidate.length;
      return Math.abs(y - avg) <= tolerance;
    });
    if (!row) { row = []; rows.push(row); }
    row.push(word);
  }
  rows.sort((a, b) => Math.min(...a.map(w => w.bbox.y0)) - Math.min(...b.map(w => w.bbox.y0)));
  return rows.map(row => {
    const ordered = [...row].sort((a, b) => a.bbox.x0 - b.bbox.x0);
    const gaps = ordered.slice(1).map((w, i) => Math.max(0, w.bbox.x0 - ordered[i].bbox.x1)).filter(g => g > 2).sort((a, b) => a - b);
    const cut = Math.max(14, (gaps[Math.floor(gaps.length / 2)] || 8) * 2.4);
    const cells: Word[][] = [];
    for (const word of ordered) {
      const last = cells[cells.length - 1];
      if (!last || word.bbox.x0 - last[last.length - 1].bbox.x1 >= cut) cells.push([word]);
      else last.push(word);
    }
    return cells.reverse().map(buildCell).filter(Boolean).join(' | ');
  }).filter(Boolean).join('\n');
}

async function prepare(src: string) {
  if (typeof window === 'undefined') return [{ image: src, mode: PSM.SINGLE_COLUMN }];
  return new Promise<{ image: string; mode: PSM }[]>(resolve => {
    const image = new Image();
    image.onload = () => {
      try {
        const max = 2800;
        const sw = image.naturalWidth || image.width || 1;
        const sh = image.naturalHeight || image.height || 1;
        const scale = Math.min(2, max / Math.max(sw, sh));
        const width = Math.max(1, Math.round(sw * scale));
        const height = Math.max(1, Math.round(sh * scale));
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve([{ image: src, mode: PSM.SINGLE_COLUMN }]);
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height); ctx.drawImage(image, 0, 0, width, height);
        const original = canvas.toDataURL('image/png');
        const pixels = ctx.getImageData(0, 0, width, height);
        const gray = new Uint8ClampedArray(width * height);
        let min = 255, maxValue = 0;
        for (let p = 0, i = 0; i < pixels.data.length; i += 4, p++) {
          const value = Math.round(0.299 * pixels.data[i] + 0.587 * pixels.data[i + 1] + 0.114 * pixels.data[i + 2]);
          gray[p] = value; min = Math.min(min, value); maxValue = Math.max(maxValue, value);
        }
        const make = (threshold: boolean) => {
          const out = ctx.createImageData(width, height); const range = Math.max(1, maxValue - min);
          for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
            const value = threshold ? (gray[p] > 168 ? 255 : 0) : Math.round(((gray[p] - min) / range) * 255);
            out.data[i] = out.data[i + 1] = out.data[i + 2] = value; out.data[i + 3] = 255;
          }
          ctx.putImageData(out, 0, 0); return canvas.toDataURL('image/png');
        };
        resolve([{ image: original, mode: PSM.SINGLE_COLUMN }, { image: make(false), mode: PSM.SINGLE_BLOCK }, { image: make(true), mode: PSM.SPARSE_TEXT }]);
      } catch { resolve([{ image: src, mode: PSM.SINGLE_COLUMN }]); }
    };
    image.onerror = () => resolve([{ image: src, mode: PSM.SINGLE_COLUMN }]); image.src = src;
  });
}

function merge(texts: string[]) {
  const seen = new Set<string>(); const output: string[] = [];
  for (const text of texts) for (const line of text.split('\n').map(clean).filter(Boolean)) {
    const key = line.toLowerCase().replace(/\s+/g, ' ');
    if (!seen.has(key)) { seen.add(key); output.push(line); }
  }
  return output.join('\n');
}

export async function ocrImageDataUrlWithLayout(src: string, cb?: (progress: number) => void) {
  if (!src || typeof window === 'undefined') return { text: '', layoutText: '' };
  try {
    const worker = await getWorker(); const variants = await prepare(src); const texts: string[] = []; const layouts: string[] = [];
    for (let index = 0; index < variants.length; index++) {
      const variant = variants[index];
      await worker.setParameters({ tessedit_pageseg_mode: variant.mode, preserve_interword_spaces: '1', user_defined_dpi: '300' });
      cb?.(10 + index * 25);
      const result = await wait(worker.recognize(variant.image), index === 0 ? 180000 : 120000, `تحليل الصورة محلياً (${index + 1})`);
      const text = String(result?.data?.text || '').trim();
      if (text) texts.push(text);
      const layout = buildLayout(((result?.data as any)?.words || []) as Word[]);
      if (layout) layouts.push(layout);
      if (index === 0 && text.length > 180) break;
    }
    cb?.(100); return { text: merge(texts), layoutText: merge(layouts) };
  } catch (error) { workerPromise = null; throw error; }
}

export async function ocrImageDataUrl(src: string, cb?: (progress: number) => void) {
  const result = await ocrImageDataUrlWithLayout(src, cb); return [result.text, result.layoutText].filter(Boolean).join('\n');
}

export async function ocrPdfPages(pages: string[], cb?: (page: number, total: number) => void) {
  const output: string[] = [];
  for (let index = 0; index < (pages || []).length; index++) {
    const text = await ocrImageDataUrl(pages[index], progress => cb?.(index + progress / 100, pages.length));
    if (text) output.push(`--- OCR الصفحة ${index + 1} ---\n${text}`);
  }
  return output.join('\n\n').trim();
}
