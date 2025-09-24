import React, { useRef, useState } from "react";
import { extractPdfTextFromFile } from "./useLocalPdf";
import { parseDecision, ParsedDecision, assessVAFingerprint } from "./parseDecision";
import { ENABLE_AI, buildAiPayload, requestAiSummary } from "./ai";

// --- Limits ---
const MAX_FILE_MB = 25;
const MAX_PAGES = 60;

export default function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Core state
  const [busy, setBusy] = useState(false);
  const [raw, setRaw] = useState<string>("");
  const [parsed, setParsed] = useState<ParsedDecision | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Guardrails
  const [looksLikeVA, setLooksLikeVA] = useState<boolean | null>(null);
  const [vaSignals, setVaSignals] = useState<string[]>([]);
  const [overrideProceed, setOverrideProceed] = useState(false);


  // AI state
  const [cloudConsent, setCloudConsent] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiText, setAiText] = useState<string>("");

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
    setAiText("");

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

      // If the PDF has no selectable text, explain clearly (no jargon)
      if (!out.hadText || !out.text.trim()) {
        setRaw("");
        setParsed(null);
        setLooksLikeVA(null);
        setVaSignals([]);
        setError(
          "We couldn’t read the words from this file. This usually happens when the letter is a photo/scan instead of real text. " +
          "If possible, try to get a clearer copy of your decision letter or re-save it as a text-based PDF. " +
          "You can also use a free PDF-to-Text tool (for example: https://www.adobe.com/acrobat/online/pdf-to-text.html) and then upload the result here."
        );
        return;
      }

      setRaw(out.text);

      // Normal parse path
      const p = parseDecision(out.text);
      setParsed(p);
      const fp = assessVAFingerprint(out.text, p);
      setLooksLikeVA(fp.looksLikeVA);
      setVaSignals(fp.signals);
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

  // AI summary
  const onAiSummary = async () => {
    if (!parsed) return;
    if (!cloudConsent && ENABLE_AI) {
      setError("Please allow cloud processing to use AI Summary.");
      return;
    }
    setError(null);
    setAiBusy(true);
    try {
      const payload = buildAiPayload(raw, parsed);
      const summary = await requestAiSummary(payload);
      setAiText(summary);
    } catch (e: any) {
      setAiText("");
      setError(e?.message || "AI summary failed.");
    } finally {
      setAiBusy(false);
    }
  };

  const showParsedSummary = parsed && (looksLikeVA || overrideProceed);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", height: "100%", display: "flex", flexDirection: "column" }}>
      <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:"1px solid #eee"}}>
        <strong>VA Decision Letter Audit</strong>
        <button onClick={handleClose} title="Close panel" aria-label="Close panel">✕</button>
      </header>

      <main style={{ padding: 16, gap: 12, display: "flex", flexDirection: "column", overflow: "auto" }}>
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

            {/* AI section */}
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  id="cloudConsent"
                  type="checkbox"
                  checked={cloudConsent}
                  onChange={(e) => setCloudConsent(e.target.checked)}
                  disabled={!ENABLE_AI}
                />
                <label htmlFor="cloudConsent" style={{ userSelect: "none" }}>
                  Allow cloud processing for AI summary
                </label>
                <button onClick={onAiSummary} disabled={!ENABLE_AI || aiBusy || !parsed}>
                  {aiBusy ? "Summarizing…" : ENABLE_AI ? "AI Summary" : "AI Summary (coming soon)"}
                </button>
              </div>

              {aiText && (
                <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, whiteSpace: "pre-wrap" }}>
                  {aiText}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Extracted but not parsed */}
        {!parsed && raw && !error && (
          <div style={{ fontSize: 12, color: "#607D8B" }}>
            We extracted text, but couldn’t confidently detect a standard VA decision format.
          </div>
        )}

        {/* Error banner (friendly text for image-only PDFs included) */}
        {error && (
          <div style={{ background: "#fff3cd", border: "1px solid #ffeeba", color: "#856404", padding: 12, borderRadius: 8 }}>
            {error}
          </div>
        )}

        {/* Footer */}
        <footer style={{ marginTop: 12, paddingTop: 8, borderTop: "1px solid #eee", fontSize: 12, color: "#607d8b" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <a
              href="https://buymeacoffee.com/tanwill2"
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: "none", fontWeight: 600 }}
              title="Support this project"
            >
              ☕ Support on Buy Me a Coffee
            </a>
            <span>•</span>
            <details>
              <summary style={{ cursor: "pointer" }}>About & Privacy</summary>
              <div style={{ marginTop: 6, lineHeight: 1.5 }}>
                <p style={{ margin: 0 }}>
                  <b>VA Decision Letter Audit</b> helps you read VA decision letters in plain English.
                  Parsing happens <b>locally</b> in your browser. Your PDFs are <b>not uploaded</b>.
                </p>
                <p style={{ margin: "6px 0 0" }}>
                  AI features require consent before any cloud processing. This tool is not legal advice.
                </p>
              </div>
            </details>
          </div>
        </footer>
      </main>
    </div>
  );
}

const th: React.CSSProperties = { textAlign: "left", padding: "8px 6px", borderBottom: "1px solid #eee", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "8px 6px", borderBottom: "1px solid #f2f2f2", verticalAlign: "top" };
const bannerGood: React.CSSProperties = { background: "#E8F5E9", border: "1px solid #C8E6C9", color: "#256029", padding: 12, borderRadius: 8 };
const bannerWarn: React.CSSProperties = { background: "#FFF8E1", border: "1px solid #FFECB3", color: "#7A4F01", padding: 12, borderRadius: 8 };
