import React, { useRef, useState } from "react";
import { extractPdfTextFromFile } from "./useLocalPdf";

export default function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ text: string; pageCount: number; hadText: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => window.parent.postMessage({ type: "VA_AUDIT_CLOSE" }, "*");

  const onPickClick = () => fileInputRef.current?.click();

  const onFileChosen = async (file?: File) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    setResult(null);
    try {
      const out = await extractPdfTextFromFile(file);
      setResult(out);
      if (!out.hadText) {
        setError(
          "No selectable text found. This PDF looks like a scanned image. We’ll add OCR next so you can process scans."
        );
      }
    } catch (e: any) {
      setError(e?.message || "Could not read that PDF.");
    } finally {
      setBusy(false);
    }
  };

  const onDrop: React.DragEventHandler<HTMLDivElement> = async (e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f && f.type === "application/pdf") onFileChosen(f);
  };

  const onDragOver: React.DragEventHandler<HTMLDivElement> = (e) => e.preventDefault();

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", height: "100%", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 16px",
          borderBottom: "1px solid #eee",
        }}
      >
        <strong>VA Decision Letter Audit</strong>
        <button onClick={handleClose} title="Close panel" aria-label="Close panel">
          ✕
        </button>
      </header>

      <main style={{ padding: 16, gap: 12, display: "flex", flexDirection: "column", overflow: "auto" }}>
        <section style={{ display: "grid", gap: 8 }}>
          <h3 style={{ margin: 0 }}>Analyze a local PDF</h3>
          <p style={{ margin: 0 }}>
            Choose or drop your VA decision letter PDF. We’ll extract the text on your computer (no upload).
          </p>

          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            style={{
              border: "2px dashed #cfd8dc",
              borderRadius: 12,
              padding: 16,
              textAlign: "center",
              background: "#fafafa",
            }}
          >
            <p style={{ margin: "0 0 8px 0" }}>Drag & drop a PDF here</p>
            <p style={{ margin: 0 }}>— or —</p>
            <div style={{ marginTop: 8 }}>
              <button onClick={onPickClick} disabled={busy}>
                {busy ? "Reading…" : "Choose PDF"}
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              style={{ display: "none" }}
              onChange={(e) => onFileChosen(e.target.files?.[0] || undefined)}
            />
          </div>
        </section>

        {error && (
          <div
            style={{
              background: "#fff3cd",
              border: "1px solid #ffeeba",
              color: "#856404",
              padding: 12,
              borderRadius: 8,
            }}
          >
            {error}
          </div>
        )}

        {result && (
          <section style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 12, color: "#607d8b" }}>
              Pages: {result.pageCount} • {result.hadText ? "Text detected" : "No selectable text"}
            </div>
            <textarea
              readOnly
              value={result.text || "(no text extracted)"}
              style={{ width: "100%", minHeight: 240, resize: "vertical", fontFamily: "ui-monospace, monospace" }}
            />
          </section>
        )}

        <hr />

        <section style={{ display: "grid", gap: 8 }}>
          <h4 style={{ margin: 0 }}>Coming next</h4>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            <li>“Analyze this page” for web-hosted PDFs and VA.gov pages</li>
            <li>Plain-English summary of conditions, ratings, effective dates</li>
            <li>Flags for math, effective date, and overlooked evidence</li>
            <li>OCR option for scanned PDFs</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
