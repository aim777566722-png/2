import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

const localPdfOcrPlugin = () => ({
  name: 'purchasemate-local-pdf-ocr',
  enforce: 'post' as const,
  transform(code: string, id: string) {
    if (!id.endsWith('/src/utils/documentParser.ts')) return null;
    if (code.includes("from '../services/localOcr'")) return null;

    const injectedImport = "import { ocrPdfPages } from '../services/localOcr';\n";
    const marker = 'return { pageImages, extractedText: fullText, matrix: rawRows };';
    if (!code.includes(marker)) return null;

    const replacement = "const localOcrText = await ocrPdfPages(pageImages);\n    if (localOcrText) fullText = [fullText, localOcrText].filter(Boolean).join('\\n\\n');\n\n    return { pageImages, extractedText: fullText, matrix: rawRows };";
    return { code: injectedImport + code.replace(marker, replacement), map: null };
  },
});

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss(), localPdfOcrPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
