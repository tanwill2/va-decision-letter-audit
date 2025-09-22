import React, { useRef, useState } from "react";
import { extractPdfTextFromFile } from "./useLocalPdf";
import { parseDecision, ParsedDecision, assessVAFingerprint } from "./parseDecision";

// --- Limits ---
const MAX_FILE_MB = 25;
const MAX_PAGES = 60;

export default function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [raw, setRaw] = useState<string>("");
  const [parsed, setParsed] = useState<ParsedDecision | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Guardrail state
  const [looksLikeVA, setLooksLikeVA] = useState<boolean | null>(null);
  const [vaSignals, setVaSignals] = useState<string[]>([]);
  const [overrideProceed, setOverrideProceed] = useState(false);

  // NEW: URL import state
  const [pdfUrl, setPdfUrl] = useState("");

  const handleClose = () => window.parent.postMessage({ type: "VA_AUDIT_CLOSE" }, "*");
  const onPickClick = () => fileInputRef.current?.click();

  async function runExtractionOnFile(file: File) {
    setError(null);
    setBusy(true);
    setParsed(null);
    setRaw("");
    setLooksLikeVA(null);
    setVaSignals([]);
    setOverrideProceed(false);

    const sizeMb = file.size / (1024 * 1024);
    if (sizeMb > MAX_FILE_MB) {
      setBusy(false);
      setError(`That file is ${sizeMb.toFixed(1)} MB. Limit is ${MAX_FILE_MB} MB for now.`);
      return;
    }

    try {
      const out = await extractPdfTextFromFile(file);
      if (out.pageCount > MAX_PAGES) {
        setBusy(false);
        setError(`This PDF has ${out.pageCount} pages. Limit is ${MAX_PAGES} pages for the MVP.`);
        return;
      }
      setRaw(out.text);

      if (!out.hadText) {
        setError("No selectable text found. This looks like a scanned PDF. OCR is coming soon.");
      } else {
        const p = parseDecision(out.text);
        setParsed(p);
        const fp = assessVAFingerprint(out.text, p);
        setLooksLikeVA(fp.looksLikeVA);
        setVaSignals(fp.signals);
      }
    } catch (e: any) {
      setError(e?.message || "Could not read that PDF.");
    } finally {
      setBusy(false);
    }
  }

  const onFileChosen = async (file?: File) => {
    if (!file) return;
    await runExtractionOnFile(file);
  };

  const onDrop: React.DragEventHandler<HTMLDivElement> = async (e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f && f.type === "application/pdf") onFileChosen(f);
  };
  const onDragOver: React.DragEventHandler<HTMLDivElement> = (e) => e.preventDefault();

  // NEW: Import from URL
  const onImportUrl = async () => {
    const url = pdfUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      setError("Please enter a valid http(s) URL to a PDF.");
      return;
    }
    setError(null);
    setBusy(true);
    setParsed(null);
    setRaw("");
    setLooksLikeVA(null);
    setVaSignals([]);
    setOverrideProceed(false);

    try {
      const resp = await chrome.runtime.sendMessage({ type: "FETCH_PDF_URL", url }) as any;
      if (!resp?.ok) throw new Error(resp?.error || "Fetch failed");

      // Decode base64 -> Uint8Array -> File, then reuse existing pipeline
      const bytes = base64ToUint8(resp.base64);
      const file = new File([bytes], "import.pdf", { type: "application/pdf" });
      await runExtractionOnFile(file);
    } catch (e: any) {
      setError(e?.message || "Could not import that URL.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", height: "100%", display: "flex", flexDirection: "column" }}>
      <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:"1px solid #eee"}}>
        <strong>VA Decision Letter Audit</strong>
        <button onClick={handleClose} title="Close panel" aria-label="Close panel">✕</button>
      </header>

      <main style={{ padding: 16, gap: 12, display: "flex", flexDirection: "column", overflow: "auto" }}>
        {/* NEW: Import from URL */}
        <section style={{ display: "grid", gap: 8 }}>
          <h3 style={{ margin: 0 }}>Import from URL (optional)</h3>
          <p style={{ margin: 0 }}>Paste a direct link to a PDF (e.g., from VA.gov or Google Drive sharing).</p>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={pdfUrl}
              onChange={(e) => setPdfUrl(e.target.value)}
              placeholder="https://example.com/your-decision.pdf"
              style={{ flex: 1, padding: "8px 10px", border: "1px solid #ddd", borderRadius: 8 }}
            />
            <button onClick={onImportUrl} disabled={busy || !pdfUrl.trim()}>
              {busy ? "Fetching…" : "Fetch & Analyze"}
            </button>
          </div>
          <div style={{ fontSize: 11, color: "#9e9e9e" }}>
            If the site blocks cross-origin downloads, we’ll guide you to download the PDF and use the local upload below.
          </div>
        </section>

        {/* Upload area */}
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

        {/* Confidence banner */}
        {parsed && looksLikeVA && (
          <div style={bannerGood}>
            ✅ This looks like a VA decision letter. Confidence: <b>{parsed.confidence}</b>
            {parsed.combinedRatingStated != null && <> • Combined rating: <b>{parsed.combinedRatingStated}%</b></>}
          </div>
        )}

        {/* Guardrail warning */}
        {parsed && looksLikeVA === false && !overrideProceed && (
          <div style={bannerWarn}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Heads up: this doesn’t look like a standard VA decision letter.</div>
            <ul style={{ margin: "0 0 8px 18px" }}>
              {vaSignals.slice(0, 4).map((s, i) => <li key={i}>{s}</li>)}
            </ul>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setOverrideProceed(true)}>Analyze anyway</button>
              <button onClick={() => { setParsed(null); setRaw(""); setLooksLikeVA(null); }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Parsed summary */}
        {(parsed && (looksLikeVA || overrideProceed)) && (
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

        {/* Extracted but not parsed */}
        {!parsed && raw && !error && (
          <div style={{ fontSize: 12, color: "#607D8B" }}>
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

const bannerGood: React.CSSProperties = {
  background: "#E8F5E9",
  border: "1px solid #C8E6C9",
  color: "#256029",
  padding: 12,
  borderRadius: 8,
};

const bannerWarn: React.CSSProperties = {
  background: "#FFF8E1",
  border: "1px solid #FFECB3",
  color: "#7A4F01",
  padding: 12,
  borderRadius: 8,
};

// helper: base64 -> Uint8Array
function base64ToUint8(b64: string) {
  const binStr = atob(b64);
  const len = binStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binStr.charCodeAt(i);
  return bytes;
}
