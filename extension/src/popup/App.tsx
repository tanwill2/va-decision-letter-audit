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

// Limits
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
  const [fpConfidence, setFpConfidence] = useState<"low" | "medium" | "high" | null>(null);

  // AI state
  const [cloudConsent, setCloudConsent] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiText, setAiText] = useState<string>("");

  const onPickClick = () => fileInputRef.current?.click();

  async function runExtractionOnFile(file: File) {
    setError(null);
    setBusy(true);
    setParsed(null);
    setRaw("");
    setLooksLikeVA(null);
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

      if (!out.hadText || !out.text.trim()) {
        setRaw("");
        setParsed(null);
        setLooksLikeVA(null);
        setError(
          "We couldn’t read the words from this file. This usually happens when the letter is a photo/scan instead of real text. " +
            "If possible, try to get a clearer copy of your decision letter or re-save it as a text-based PDF. " +
            "You can also use a free PDF-to-Text tool (for example: https://www.freeconvert.com/pdf-to-text) and then upload the result here."
        );
        return;
      }

      setRaw(out.text);

      const p = parseDecision(out.text);
      setParsed(p);
      const fp = assessVAFingerprint(out.text, p);
      setLooksLikeVA(fp.looksLikeVA);
      setFpConfidence(fp.confidence);
    } catch (e: any) {
      setError(e?.message || "Could not read that file.");
    } finally {
      setBusy(false);
    }
  }

  function extractSection(aiText: string, header: string): string | null {
  if (!aiText) return null;
  const idx = aiText.indexOf(header);
  if (idx === -1) return null;
  // find the next numbered header like "7) " or "8) "
  const next = aiText.slice(idx + header.length).search(/\n\s*\d\)\s+/);
  const body = next === -1
    ? aiText.slice(idx + header.length).trim()
    : aiText.slice(idx + header.length, idx + header.length + next).trim();
  return body || null;
}


  const onFileChosen = async (file?: File) => {
    if (!file) return;
    await runExtractionOnFile(file);
  };

  const onDrop: React.DragEventHandler<HTMLDivElement> = async (e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    if (f.type === "application/pdf" || f.type === "text/plain" || /\.txt$/i.test(f.name)) {
      onFileChosen(f);
    }
  };
  const onDragOver: React.DragEventHandler<HTMLDivElement> = (e) => e.preventDefault();

  // AI summary
  const onAiSummary = async () => {
    if (!parsed) return;
    if (!looksLikeVA || !(fpConfidence === "medium" || fpConfidence === "high")) {
      setError("AI analysis is only available for recognized VA decision letters.");
      return;
    }
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

  const favorable = extractSection(aiText, "5) Favorable findings");
  const denials = extractSection(aiText, "6) Denials");


  return (
    <div className="wrap">
      {/* Header */}
      <div className="header">
        <div className="brand">
          <span>🇺🇸</span>
          <span>VA Decision Letter Audit</span>
        </div>
        <span className="badge">Popup</span>
      </div>

      {/* Upload card */}
      <section className="card">
        <h3>Analyze a local PDF or TXT file</h3>
        <p className="help">We extract text locally first, then securely send to our AI provider for analysis. We never store your files.</p>

        <div className="drop" onDrop={onDrop} onDragOver={onDragOver}>
          <p style={{ margin: "0 0 8px 0" }}>Drag & drop here</p>
          <p style={{ margin: 0 }}>— or —</p>
          <div style={{ marginTop: 8 }}>
            <button className="btn" onClick={onPickClick} disabled={busy}>
              {busy ? "Reading…" : "Choose file"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,application/pdf,text/plain"
              style={{ display: "none" }}
              onChange={(e) => onFileChosen(e.target.files?.[0] || undefined)}
            />
          </div>
        </div>
      </section>

      {/* Confidence banner */}
      {parsed && looksLikeVA && (
        <div className="banner-good">
          ✅ This looks like a VA decision letter. Confidence: <b>{fpConfidence}</b>
          {parsed.combinedRatingStated != null && <> • Combined rating: <b>{parsed.combinedRatingStated}%</b></>}
        </div>
      )}

      {/* Low confidence warning */}
      {parsed && (!looksLikeVA || fpConfidence === "low") && (
        <div className="banner-warn">
          This doesn’t appear to be a VA decision letter. To protect your privacy and keep this free,
          AI analysis is only available for recognized VA decision letters.
          <div className="help" style={{ marginTop: 6 }}>
            Tips: Look for headings like “Decision”, “Evidence”, “Reasons for Decision”, and phrases like “Diagnostic Code”,
            “Combined Rating”, or “Effective Date”.
          </div>
        </div>
      )}

      {/* AI section (gated) */}
      {parsed && looksLikeVA && (fpConfidence === "medium" || fpConfidence === "high") && (
        <section className="card" style={{ display: "grid", gap: 8 }}>
          <h3>AI Summary</h3>
            <div className="row">
              <label className="checkbox">
                <input
                  id="cloudConsent"
                  type="checkbox"
                  checked={cloudConsent}
                  onChange={(e) => setCloudConsent(e.target.checked)}
                  disabled={!ENABLE_AI}
                />
                <span>Allow cloud processing for AI summary</span>
              </label>

              <button className="btn" onClick={onAiSummary} disabled={!ENABLE_AI || aiBusy || !parsed}>
                {aiBusy ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <span className="spinner"></span> Summarizing…
                  </span>
                ) : (
                  "Run AI"
                )}
              </button>

              {/* Retry appears only when there is an AI-related error */}
              {error && /AI summary failed|Please allow cloud processing/.test(error) && (
                <button className="btn" onClick={onAiSummary} disabled={aiBusy}>
                  Retry
                </button>
              )}
            </div>
          {aiText && (
            <div style={{ display: "grid", gap: 10 }}>
              {/* Callouts */}
              {favorable && (
                <div className="banner-good">
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Favorable findings</div>
                  <div style={{ whiteSpace: "pre-wrap" }}>{favorable}</div>
                </div>
              )}
              {denials && denials.toLowerCase().trim() !== "no denials in this letter." && (
                <div className="banner-warn">
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Denials</div>
                  <div style={{ whiteSpace: "pre-wrap" }}>{denials}</div>
                </div>
              )}

              {/* Disclaimer + full text */}
              <div className="ai-note">⚠️ This summary is for informational purposes only. It is not legal advice.</div>
              <div className="ai-output">{aiText}</div>
              <div className="ai-note">⚠️ This summary is for informational purposes only. It is not legal advice.</div>
            </div>
          )}
        </section>
      )}

      {/* Error banner */}
      {error && (
        <div className="card" style={{ borderColor: "#ffeeba", background: "#fffdf5" }}>
          {error}
        </div>
      )}

      {/* Footer */}
      <footer className="card" style={{ padding: 12 }}>
        <div className="footer">
          <a className="bmac" href="https://buymeacoffee.com/kairobox" target="_blank" rel="noopener noreferrer">☕ Support</a>
          <div className="muted">v0.1.0 • About & Privacy: Parsing happens locally. AI requires explicit consent.</div>
        </div>
      </footer>
    </div>
  );
}
