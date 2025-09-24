import React, { useRef, useState } from "react";
import { extractPdfTextFromFile } from "./useLocalPdf";
import { parseDecision, ParsedDecision, assessVAFingerprint } from "./parseDecision";
import { ENABLE_AI, buildAiPayload, requestAiSummary } from "./ai";

// Read either a PDF or a plain .txt file
async function extractFromAnyFile(file: File) {
  if (file.type === "text/plain" || /\.txt$/i.test(file.name)) {
    const text = await file.text();
    return { text, hadText: !!text.trim(), pageCount: 1 };
  }
  // default: PDF path
  return await extractPdfTextFromFile(file);
}

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
    setAiText("");

    const sizeMb = file.size / (1024 * 1024);
    if (sizeMb > MAX_FILE_MB) {
      setBusy(false);
      setError(`That file is ${sizeMb.toFixed(1)} MB. Limit is ${MAX_FILE_MB} MB for now.`);
      return;
    }

    try {
      const out = await extractFromAnyFile(file);
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
          "You can also use a free PDF-to-Text tool (for example: https://www.freeconvert.com/pdf-to-text) and then upload the result here."
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
      if (!f) return;
      if (
        f.type === "application/pdf" ||
        f.type === "text/plain" ||
        /\.txt$/i.test(f.name)
      ) {
        onFileChosen(f);
      }
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

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", height: "100%", display: "flex", flexDirection: "column" }}>
      <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:"1px solid #eee"}}>
        <strong>VA Decision Letter Audit</strong>
        <button onClick={handleClose} title="Close panel" aria-label="Close panel">✕</button>
      </header>

      <main style={{ padding: 16, gap: 12, display: "flex", flexDirection: "column", overflow: "auto" }}>
        {/* Upload area */}
        <section style={{ display: "grid", gap: 8 }}>
          <h3 style={{ margin: 0 }}>Analyze a local PDF or TXT file</h3>
          <p style={{ margin: 0 }}>Choose or drop your VA decision letter PDF or TXT file. The text is extracted locally first, then securely sent to our AI provider for analysis. We never store your files.</p>

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
              accept=".pdf,.txt,application/pdf,text/plain"
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

        {/* AI section (only when guardrail passes) */}
        {parsed && looksLikeVA && (
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
                {aiBusy ? "Summarizing…" : "AI Summary"}
              </button>
            </div>

            {aiText && (
              <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, whiteSpace: "pre-wrap" }}>
                {aiText}
              </div>
            )}
          </div>
        )}

        {parsed && looksLikeVA === false && (
          <div style={bannerWarn}>
            This doesn’t appear to be a VA decision letter. To protect your privacy and keep this tool free,
            AI analysis is only available for VA decision letters. Please upload your official VA decision/rating letter.
            <div style={{ marginTop: 6, fontSize: 12, color: "#7a7a7a" }}>
              Tips: Look for headings like “Decision”, “Evidence”, “Reasons for Decision”, and phrases like “Diagnostic Code”, “Combined Rating”, or “Effective Date”.
            </div>
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
