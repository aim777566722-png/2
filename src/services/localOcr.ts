import { createWorker, PSM } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';

let workerPromise: ReturnType<typeof createWorker> | null = null;
const pageCanvas = new WeakMap<object, HTMLCanvasElement>();
const pageOcrText = new WeakMap<object, Promise<string>>();

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

async function ocrCanvas(canvas: HTMLCanvasElement): Promise<string> {
  try {
    const worker = await getWorker();
    const result = await worker.recognize(canvas);
    return String(result?.data?.text || '').trim();
  } catch (error) {
    console.warn('Local PDF OCR failed:', error);
    return '';
  }
}

export async function ocrPdfPages(pageImages: string[], onPageProgress?: (page: number, total: number) => void): Promise<string> {
  if (!pageImages?.length) return '';
  const chunks: string[] = [];
  for (let i = 0; i < pageImages.length; i++) {
    const text = await ocrImageDataUrl(pageImages[i], progress => onPageProgress?.(i + Math.max(0, progress) / 100, pageImages.length));
    if (text) chunks.push(`--- OCR الصفحة ${i + 1} ---\n${text}`);
  }
  return chunks.join('\n\n').trim();
}

/**
 * PDF bridge: every PDF page is rendered locally and passed through Tesseract.
 * The OCR result is injected into PDF.js text content so the existing parser
 * automatically consumes it for scanned, mixed, and text PDFs.
 */
function installPdfOcrBridge() {
  if (typeof window === 'undefined') return;
  const api: any = pdfjsLib as any;
  if (api.__purchaseMateLocalOcrInstalled || typeof api.getDocument !== 'function') return;
  const originalGetDocument = api.getDocument;

  api.getDocument = function (...args: any[]) {
    const loadingTask = originalGetDocument.apply(this, args);
    loadingTask.promise = loadingTask.promise.then((pdf: any) => {
      if (pdf.__purchaseMateLocalOcrWrapped) return pdf;
      pdf.__purchaseMateLocalOcrWrapped = true;
      const originalGetPage = pdf.getPage.bind(pdf);
      pdf.getPage = async (pageNumber: number) => {
        const page = await originalGetPage(pageNumber);
        if (page.__purchaseMateLocalOcrWrapped) return page;
        page.__purchaseMateLocalOcrWrapped = true;

        const originalRender = page.render.bind(page);
        page.render = (params: any) => {
          const canvas = params?.canvasContext?.canvas;
          if (canvas) pageCanvas.set(page, canvas);
          return originalRender(params);
        };

        const originalGetTextContent = page.getTextContent.bind(page);
        page.getTextContent = async (...textArgs: any[]) => {
          const original = await originalGetTextContent(...textArgs);
          const existingText = (original?.items || []).map((item: any) => String(item?.str || '').trim()).filter(Boolean).join(' ').trim();
          let ocrPromise = pageOcrText.get(page);
          if (!ocrPromise) {
            ocrPromise = (async () => {
              let canvas = pageCanvas.get(page);
              if (!canvas) {
                const viewport = page.getViewport({ scale: 2 });
                canvas = document.createElement('canvas');
                canvas.width = Math.ceil(viewport.width);
                canvas.height = Math.ceil(viewport.height);
                const ctx = canvas.getContext('2d');
                if (!ctx) return '';
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                await originalRender({ canvasContext: ctx, viewport }).promise;
                pageCanvas.set(page, canvas);
              }
              return ocrCanvas(canvas);
            })();
            pageOcrText.set(page, ocrPromise);
          }
          const ocrText = await ocrPromise;
          if (!ocrText) return original;
          const useOcr = existingText.length < 120 || ocrText.length >= Math.max(80, existingText.length * 0.45);
          if (!useOcr) return original;
          return {
            ...original,
            items: [...(original?.items || []), {
              str: `\n[OCR محلي للصفحة] ${ocrText}`,
              dir: 'rtl', width: 0, height: 0,
              transform: [1, 0, 0, 1, 0, 0],
              fontName: 'OCR', hasEOL: true,
            }],
          };
        };
        return page;
      };
      return pdf;
    });
    return loadingTask;
  };
  api.__purchaseMateLocalOcrInstalled = true;
}

installPdfOcrBridge();
