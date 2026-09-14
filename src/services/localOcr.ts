import { createWorker, PSM } from 'tesseract.js';

type OcrVariant = { image: string; mode: PSM; name: string };
type LayoutWord = { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } };

let workerPromise: ReturnType<typeof createWorker> | null = null;

const withTimeout = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(value => {
      window.clearTimeout(timer);
      resolve(value);
    }, error => {
      window.clearTimeout(timer);
      reject(error);
    });
  });

function getWorker() {
  if (!workerPromise) {
    workerPromise = withTimeout(
      createWorker('ara+eng', 1, {
        logger: () => undefined,
        workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js',
        corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0',
        langPath: 'https://cdn.jsdelivr.net/gh/naptha/tessdata@gh-pages/4.0.0',
        cachePath: 'purchasemate-ocr',
        cacheMethod: 'write',
        gzip: true,
        workerBlobURL: true,
      }).then(async worker => {
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.AUTO,
          preserve_interword_spaces: '1',
          user_defined_dpi: '300',
        });
        return worker;
      }),
      150000,
      'تشغيل محرك OCR المحلي',
    ).catch(error => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

async function prepareVariants(imageDataUrl: string): Promise<OcrVariant[]> {
  if (!imageDataUrl || typeof window === 'undefined') return [{ image: imageDataUrl, mode: PSM.AUTO, name: 'original' }];

  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        const maxDim = 2200;
        const sourceW = img.naturalWidth || img.width || 1;
        const sourceH = img.naturalHeight || img.height || 1;
        const scale = Math.min(1.6, maxDim / Math.max(sourceW, sourceH));
        const width = Math.max(1, Math.round(sourceW * scale));
        const height = Math.max(1, Math.round(sourceH * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve([{ image: imageDataUrl, mode: PSM.AUTO, name: 'original' }]);

        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const pixels = ctx.getImageData(0, 0, width, height);
        const gray = new Uint8ClampedArray(width * height);
        let min = 255;
        let max = 0;
        for (let p = 0, i = 0; i < pixels.data.length; i += 4, p++) {
          const value = Math.round(0.299 * pixels.data[i] + 0.587 * pixels.data[i + 1] + 0.114 * pixels.data[i + 2]);
          gray[p] = value;
          min = Math.min(min, value);
          max = Math.max(max, value);
        }

        const makeImage = (kind: 'contrast' | 'threshold') => {
          const out = ctx.createImageData(width, height);
          const range = Math.max(1, max - min);
          for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
            const value = kind === 'threshold'
              ? (gray[p] > 168 ? 255 : 0)
              : Math.max(0, Math.min(255, Math.round(((gray[p] - min) / range) * 255)));
            out.data[i] = value;
            out.data[i + 1] = value;
            out.data[i + 2] = value;
            out.data[i + 3] = 255;
          }
          ctx.putImageData(out, 0, 0);
          return canvas.toDataURL('image/png');
        };

        ctx.drawImage(img, 0, 0, width, height);
        const original = canvas.toDataURL('image/png');
        const contrast = makeImage('contrast');
        const threshold = makeImage('threshold');

        resolve([
          { image: original, mode: PSM.AUTO, name: 'original' },
          { image: contrast, mode: PSM.SPARSE_TEXT, name: 'contrast-sparse' },
          { image: threshold, mode: PSM.SPARSE_TEXT, name: 'threshold-sparse' },
        ]);
      } catch {
        resolve([{ image: imageDataUrl, mode: PSM.AUTO, name: 'original' }]);
      }
    };
    img.onerror = () => resolve([{ image: imageDataUrl, mode: PSM.AUTO, name: 'original' }]);
    img.src = imageDataUrl;
  });
}

function cleanOcrText(value: string): string {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/\u200e|\u200f/g, '')
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[|]+/g, ' | ')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

function mergePasses(passTexts: string[]): string {
  const lines = new Map<string, string>();
  for (const text of passTexts) {
    for (const raw of cleanOcrText(text).split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      const key = line.toLowerCase().replace(/\s+/g, ' ');
      if (!lines.has(key)) lines.set(key, line);
    }
  }
  return Array.from(lines.values()).join('\n');
}

function isArabicText(value: string): boolean {
  const arabic = (value.match(/[\u0600-\u06FF]/g) || []).length;
  const latin = (value.match(/[A-Za-z]/g) || []).length;
  return arabic > 0 && arabic >= latin;
}

function buildCell(words: LayoutWord[]): string {
  if (!words.length) return '';
  const arabic = isArabicText(words.map(w => w.text).join(' '));
  const ordered = [...words].sort((a, b) => arabic ? b.bbox.x0 - a.bbox.x0 : a.bbox.x0 - b.bbox.x0);
  return ordered.map(w => w.text.trim()).filter(Boolean).join(' ');
}

function buildLayoutText(words: LayoutWord[]): string {
  const usable = words
    .filter(word => word.text.trim() && Number.isFinite(word.confidence) && word.confidence >= 25)
    .sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
  if (!usable.length) return '';

  const heights = usable.map(word => Math.max(1, word.bbox.y1 - word.bbox.y0)).sort((a, b) => a - b);
  const medianHeight = heights[Math.floor(heights.length / 2)] || 20;
  const lineTolerance = Math.max(8, medianHeight * 0.65);
  const rows: LayoutWord[][] = [];

  for (const word of usable) {
    const centerY = (word.bbox.y0 + word.bbox.y1) / 2;
    let row = rows.find(candidate => {
      const centers = candidate.map(item => (item.bbox.y0 + item.bbox.y1) / 2);
      const average = centers.reduce((sum, value) => sum + value, 0) / centers.length;
      return Math.abs(centerY - average) <= lineTolerance;
    });
    if (!row) {
      row = [];
      rows.push(row);
    }
    row.push(word);
  }

  rows.sort((a, b) => Math.min(...a.map(word => word.bbox.y0)) - Math.min(...b.map(word => word.bbox.y0)));
  return rows.map(row => {
    // Detect the large horizontal gaps between table columns first. This prevents
    // Arabic words inside the medicine cell from being reversed with other columns.
    const leftToRight = [...row].sort((a, b) => a.bbox.x0 - b.bbox.x0);
    const gaps: number[] = [];
    for (let i = 1; i < leftToRight.length; i++) {
      gaps.push(leftToRight[i].bbox.x0 - leftToRight[i - 1].bbox.x1);
    }
    const positiveGaps = gaps.filter(g => g > 0).sort((a, b) => a - b);
    const medianGap = positiveGaps[Math.floor(positiveGaps.length / 2)] || 0;
    const cellGap = Math.max(18, medianGap * 2.8);

    const cells: LayoutWord[][] = [];
    for (const word of leftToRight) {
      const previousCell = cells[cells.length - 1];
      if (!previousCell) {
        cells.push([word]);
        continue;
      }
      const previous = previousCell[previousCell.length - 1];
      const gap = word.bbox.x0 - previous.bbox.x1;
      if (gap >= cellGap) cells.push([word]);
      else previousCell.push(word);
    }

    // Keep English/LTR rows in their natural order. Arabic rows need to be
    // reversed so the parser sees: code | name | unit | quantity | price...
    const orderedCells = isArabicText(row.map(word => word.text).join(' '))
      ? [...cells].reverse()
      : cells;
    return orderedCells.map(buildCell).filter(Boolean).join(' | ').trim();
  }).filter(Boolean).join('\n');
}

export async function ocrImageDataUrlWithLayout(
  imageDataUrl: string,
  onProgress?: (progress: number) => void,
): Promise<{ text: string; layoutText: string }> {
  if (!imageDataUrl || typeof window === 'undefined') return { text: '', layoutText: '' };
  try {
    onProgress?.(5);
    const worker = await getWorker();
    onProgress?.(10);
    const variants = await prepareVariants(imageDataUrl);
    const texts: string[] = [];
    const layoutTexts: string[] = [];

    const first = variants[0];
    await worker.setParameters({
      tessedit_pageseg_mode: first.mode,
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
    });
    onProgress?.(20);
    const firstResult = await withTimeout(worker.recognize(first.image), 180000, 'تحليل الصورة محلياً');
    const firstText = String(firstResult?.data?.text || '').trim();
    if (firstText) texts.push(firstText);
    const firstWords = ((firstResult?.data as any)?.words || []) as LayoutWord[];
    const firstLayout = buildLayoutText(firstWords);
    if (firstLayout) layoutTexts.push(firstLayout);
    onProgress?.(72);

    const weak = firstText.length < 80 || firstWords.length < 5;
    if (weak && variants[1]) {
      const fallback = variants[1];
      await worker.setParameters({
        tessedit_pageseg_mode: fallback.mode,
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
      });
      const fallbackResult = await withTimeout(worker.recognize(fallback.image), 120000, 'التحسين الاحتياطي للصورة');
      const fallbackText = String(fallbackResult?.data?.text || '').trim();
      if (fallbackText) texts.push(fallbackText);
      const fallbackWords = ((fallbackResult?.data as any)?.words || []) as LayoutWord[];
      const fallbackLayout = buildLayoutText(fallbackWords);
      if (fallbackLayout) layoutTexts.push(fallbackLayout);
    }
    onProgress?.(100);

    return { text: mergePasses(texts), layoutText: mergePasses(layoutTexts) };
  } catch (error) {
    console.error('Local OCR with layout failed:', error);
    workerPromise = null;
    throw error;
  }
}

export async function ocrImageDataUrl(
  imageDataUrl: string,
  onProgress?: (progress: number) => void,
): Promise<string> {
  const result = await ocrImageDataUrlWithLayout(imageDataUrl, onProgress);
  if (!result.layoutText) return result.text;
  return [result.text, result.layoutText].filter(Boolean).join('\n');
}

export async function ocrPdfPages(
  pageImages: string[],
  onPageProgress?: (page: number, total: number) => void,
): Promise<string> {
  if (!pageImages?.length) return '';
  const chunks: string[] = [];
  for (let i = 0; i < pageImages.length; i++) {
    const text = await ocrImageDataUrl(
      pageImages[i],
      progress => onPageProgress?.(i + Math.max(0, progress) / 100, pageImages.length),
    );
    if (text) chunks.push(`--- OCR الصفحة ${i + 1} ---\n${text}`);
  }
  return chunks.join('\n\n').trim();
}
