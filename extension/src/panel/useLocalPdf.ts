import * as pdfjsLib from "pdfjs-dist";

// In the extension panel context, chrome.* is available
// Tell pdf.js where to find its worker script (served by our extension)
const workerPath = (globalThis as any).chrome?.runtime?.getURL
  ? // After build, Vite copies /public/pdf.worker.min.mjs to dist/pdf.worker.min.mjs
    (globalThis as any).chrome.runtime.getURL("pdf.worker.min.mjs")
  : "/pdf.worker.min.mjs"; // fallback for dev/preview

(pdfjsLib as any).GlobalWorkerOptions.workerSrc = workerPath;

export async function extractPdfTextFromFile(file: File): Promise<{
  text: string;
  pageCount: number;
  hadText: boolean;
}> {
  const buf = await file.arrayBuffer();
  const uint8 = new Uint8Array(buf);

  const loadingTask = pdfjsLib.getDocument({ data: uint8 });
  const pdf = await loadingTask.promise;

  let fullText = "";
  let hadAnyText = false;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items
      .map((it: any) => ("str" in it ? it.str : ""))
      .filter(Boolean);
    const pageText = strings.join(" ").replace(/\s+/g, " ").trim();
    if (pageText.length > 0) hadAnyText = true;
    fullText += `\n\n--- Page ${i} ---\n${pageText}`;
  }

  return { text: fullText.trim(), pageCount: pdf.numPages, hadText: hadAnyText };
}
