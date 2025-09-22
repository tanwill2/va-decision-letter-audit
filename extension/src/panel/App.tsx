import React, { useRef, useState } from "react";
import { extractPdfTextFromFile } from "./useLocalPdf";
import { parseDecision, ParsedDecision } from "./parseDecision";

export default function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [raw, setRaw] = useState<string>("");
  const [parsed, setParsed] = useState<ParsedDecision | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => window.parent.postMessage({ type: "VA_AUDIT_CLOSE" }, "*");
  const onPickClick = () => fileInputRef.current?.click();

  const onFileChosen = async (file?: File) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    setParsed(null);
    setRaw("");
    try {
      const out = await extractPdfTextFromFile(file);
      setRaw(out.text);
      if (!out.hadText) {
        setError("No selectable text found. This PDF looks like a scanned image. OCR coming soon.");
      } else {
        const p = parseDecision(out.text);
        setParsed(p);
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
      <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:"1px solid #eee"}}>
        <strong>VA Decision Letter Audit</strong>
        <button onClick={handleClose} title="Close panel" aria-label="Close panel">✕</button>
      </header>

      <main style={{ padding: 16, gap: 12, display: "flex", flexDirection: "column", overflow: "auto" }}>
        <section style={{ display: "grid", gap: 8 }}>
          <h3 style={{ margin: 0 }}>Analyze a local PDF</h3>
          <p style={{ margin: 0 }}>Choose or drop your VA decision letter PDF. We extract text on your device (no upload).</p>

          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            style={{ border: "2px dashed #cfd8dc", borderRadius: 12, padding: 16, textAlign: "center", background: "#fafafa" }}
          >
            <p style={{ margin: "0 0 8px 0" }}>Drag & drop a PDF here</p>
            <p style={{ margin: 0 }}>— or —</p>
            <div style={{ marginTop: 8 }}>
              <button onClick={onPickClick} disabled={busy}>{busy ? "Reading…" : "Choose PDF"}</button>
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

        {parsed && (
          <section style={{ display: "grid", gap: 10 }}>
            <h3 style={{ marginBottom: 4 }}>Summary</h3>
            <div style={{ fontSize: 12, color: "#607d8b" }}>
              Confidence: <strong>{parsed.confidence}</strong>
              {parsed.combinedRatingStated != null && <> • Combined rating (stated): <strong>{parsed.combinedRatingStated}%</strong></>}
              {parsed.effectiveDates.length > 0 && <> • Effective dates found: {parsed.effectiveDates.join(", ")}</>}
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>Condition</th>
                    <th style={th}>Rating</th>
                    <th style={th}>DC</th>
                    <th style={th}>Effective date</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.conditions.map((c, i) => (
                    <tr key={i}>
                      <td style={td}>{c.name}</td>
                      <td style={td}>{c.ratingPercent != null ? `${c.ratingPercent}%` : "—"}</td>
                      <td style={td}>{c.diagnosticCode ?? "—"}</td>
                      <td style={td}>{c.effectiveDate ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Simple layman’s explanation (rules-based placeholder) */}
            <div style={{ background: "#f6f8fa", border: "1px solid #eaeef2", borderRadius: 8, padding: 12 }}>
              <strong>What this means (plain English):</strong>
              <ul style={{ margin: "6px 0 0 18px" }}>
                {parsed.conditions.slice(0, 5).map((c, i) => (
                  <li key={i}>
                    VA {c.ratingPercent != null ? <>is paying <b>{c.ratingPercent}%</b> for <b>{c.name}</b></> : <>made a decision on <b>{c.name}</b></>}{c.effectiveDate ? <> starting <b>{c.effectiveDate}</b></> : null}.
                    {c.diagnosticCode ? <> (Diagnostic Code {c.diagnosticCode})</> : null}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {!parsed && raw && !error && (
          <div style={{ fontSize: 12, color: "#607d8b" }}>
            We extracted text, but couldn’t confidently detect a standard VA decision format. We’ll add OCR/AI checks next.
          </div>
        )}

        {error && (
          <div style={{ background: "#fff3cd", border: "1px solid #ffeeba", color: "#856404", padding: 12, borderRadius: 8 }}>
            {error}
          </div>
        )}

        <div style={{ fontSize: 11, color: "#9e9e9e", marginTop: 8 }}>
          This tool provides a plain-English summary and possible fields. It is not legal advice.
        </div>
      </main>
    </div>
  );
}

const th: React.CSSProperties = { textAlign: "left", padding: "8px 6px", borderBottom: "1px solid #eee", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "8px 6px", borderBottom: "1px solid #f2f2f2", verticalAlign: "top" };
