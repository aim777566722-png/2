import { createWorker, PSM } from 'tesseract.js';

type OcrVariant = { image: string; mode: PSM; name: string };

let workerPromise: ReturnType<typeof createWorker> | null = null;

function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker('ara+eng', 1, {
      logger: () => undefined,
      langPath: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/ara@1.0.0/4.0.0',
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
    });
  }
  return workerPromise;
}

function makeVariants(imageDataUrl: string): OcrVariant[] {
  if (typeof window === 'undefined') return [{ image: imageDataUrl, mode: PSM.AUTO, name: 'original' }];
  const source = new Image();
  const variants: OcrVariant[] = [];
  // Image decoding is handled by the caller; this function only creates variants after load.
  // The fallback path returns the original image when canvas processing is unavailable.
  void source;
  return variants;
}

async function prepareVariants(imageDataUrl: string): Promise<OcrVariant[]> {
  if (!imageDataUrl || typeof window === 'undefined') return [{ image: imageDataUrl, mode: PSM.AUTO, name: 'original' }];

  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        const maxDim = 2800;
        const sourceW = img.naturalWidth || img.width || 1;
        const sourceH = img.naturalHeight || img.height || 1;
        const scale = Math.min(2, maxDim / Math.max(sourceW, sourceH));
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

        const makeImage = (kind: 'contrast' | 'threshold' | 'soft') => {
          const out = ctx.createImageData(width, height);
          const range = Math.max(1, max - min);
          for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
            let value: number;
            if (kind === 'threshold') {
              value = gray[p] > 168 ? 255 : 0;
            } else if (kind === 'soft') {
              value = Math.max(0, Math.min(255, Math.round((gray[p] - 128) * 1.45 + 128)));
            } else {
              value = Math.max(0, Math.min(255, Math.round(((gray[p] - min) / range) * 255)));
            }
            out.data[i] = value;
            out.data[i + 1] = value;
            out.data[i + 2] = value;
            out.data[i + 3] = 255;
          }
          ctx.putImageData(out, 0, 0);
          return canvas.toDataURL('image/png');
        };

        // Keep the original colour image as the first pass. Different page segmentation
        // modes catch different layouts: normal paragraphs, sparse labels and table rows.
        ctx.drawImage(img, 0, 0, width, height);
        const original = canvas.toDataURL('image/png');
        const contrast = makeImage('contrast');
        const threshold = makeImage('threshold');
        const soft = makeImage('soft');

        resolve([
          { image: original, mode: PSM.AUTO, name: 'original' },
          { image: contrast, mode: PSM.SPARSE_TEXT, name: 'contrast-sparse' },
          { image: soft, mode: PSM.SINGLE_BLOCK, name: 'enhanced-block' },
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

export async function ocrImageDataUrl(
  imageDataUrl: string,
  onProgress?: (progress: number) => void,
): Promise<string> {
  if (!imageDataUrl || typeof window === 'undefined') return '';
  try {
    const worker = await getWorker();
    const variants = await prepareVariants(imageDataUrl);
    const results: string[] = [];

    for (let i = 0; i < variants.length; i++) {
      const variant = variants[i];
      await worker.setParameters({
        tessedit_pageseg_mode: variant.mode,
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
      });
      const result = await worker.recognize(variant.image);
      const text = String(result?.data?.text || '').trim();
      if (text) results.push(text);
      onProgress?.(Math.round(((i + 1) / variants.length) * 100));
    }

    return mergePasses(results);
  } catch (error) {
    console.warn('Local OCR failed:', error);
    return '';
  }
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
