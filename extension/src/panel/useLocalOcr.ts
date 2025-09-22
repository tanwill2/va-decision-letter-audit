import * as pdfjsLib from "pdfjs-dist";
import { createWorker } from "tesseract.js";

// Render each PDF page to a canvas, OCR it, and return merged text
export async function ocrPdfFile(file: File, onProgress?: (p: { page: number; pages: number; pct: number }) => void) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;

  // Tesseract worker with local assets (no network)
  const worker = await createWorker("eng", 1, {
    workerPath: (chrome as any).runtime.getURL("ocr/tesseract.worker.min.js"),
    corePath: (chrome as any).runtime.getURL("ocr/tesseract-core.wasm"),
    langPath: (chrome as any).runtime.getURL("ocr"),
    logger: (m) => {
      // optional: log progress per page
    },
  });

  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 }); // higher scale = better OCR, slower
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width | 0;
    canvas.height = viewport.height | 0;
    await page.render({ canvas, viewport }).promise;


    // Tesseract can accept a canvas directly
    const { data } = await worker.recognize(canvas as unknown as HTMLImageElement);
    text += `\n\n--- Page ${i} (OCR) ---\n${data.text.trim()}`;

    onProgress?.({ page: i, pages: pdf.numPages, pct: Math.round((i / pdf.numPages) * 100) });
  }

  await worker.terminate();
  return { text: text.trim(), pageCount: pdf.numPages };
}
