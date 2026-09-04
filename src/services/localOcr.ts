import { createWorker, PSM } from 'tesseract.js';

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

export async function ocrImageDataUrl(imageDataUrl: string, onProgress?: (progress: number) => void): Promise<string> {
  if (!imageDataUrl || typeof window === 'undefined') return '';
  try {
    const worker = await getWorker();
    onProgress?.(35);
    const result = await worker.recognize(imageDataUrl);
    onProgress?.(90);
    return String(result?.data?.text || '').trim();
  } catch (error) {
    console.warn('Local OCR failed:', error);
    return '';
  }
}

export async function ocrPdfPages(pageImages: string[], onPageProgress?: (page: number, total: number) => void): Promise<string> {
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
