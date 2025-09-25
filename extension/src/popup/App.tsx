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
  const [fpConfidence, setFpConfidence] = useState<"low" | "medium" | "high" | null>(null);



  // AI state
  const [cloudConsent, setCloudConsent] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiText, setAiText] = useState<string>("");

  const handleClose = () => window.close();
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

      // If the PDF has no selectable text, explain clearly (no jargon)
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

      // Normal parse path
      const p = parseDecision(out.text);
      setParsed(p);
      const fp = assessVAFingerprint(out.text, p);
      setLooksLikeVA(fp.looksLikeVA);
      setFpConfidence(fp.confidence);
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
      // Hard gate: only allow medium/high confidence
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

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", height: "100%", display: "flex", flexDirection: "column" }}>
      <header style={{
        display:"flex",
        justifyContent:"space-between",
        alignItems:"flex-start",
        padding:"12px 16px",
        borderBottom:"1px solid #eee"
      }}>
        <div>
          <div style={{fontWeight:700}}>VA Decision Letter Audit</div>
          <div style={{fontSize:12, color:"#607d8b", marginTop:2}}>
            Plain-English summaries of VA decision letters
          </div>
        </div>
        <button onClick={handleClose} title="Close" aria-label="Close"
          style={{ border:"1px solid #e5e7eb", background:"#fff", borderRadius:6, padding:"2px 6px" }}>
          ✕
        </button>
      </header>
      <main style={{ padding: 16, gap: 12, display: "flex", flexDirection: "column", overflow: "auto" }}>
        {/* Upload area */}
        <section style={{ display: "grid", gap: 8 }}>
          <h3 style={{ margin: 0 }}>Upload Decision Letter</h3>
          <p style={{ margin: 0 }}>
            Choose or drop your VA decision letter PDF or TXT file. We never store your files.
            Text is extracted locally first, then securely analyzed.
          </p>
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            style={{ border: "2px dashed #cfd8dc", borderRadius: 12, padding: 16, textAlign: "center", background: "#fafafa" }}
          >
            <p style={{ margin: "0 0 8px 0" }}>Drag & drop a PDF or TXT file here</p>
            <p style={{ margin: 0 }}>- or -</p>
            <div style={{ marginTop: 8 }}>
              <button onClick={onPickClick} disabled={busy}>{busy ? "Reading…" : "Choose File"}</button>
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
            ✅ This looks like a VA decision letter. Confidence: <b>{fpConfidence}</b>
            {parsed.combinedRatingStated != null && <> • Combined rating: <b>{parsed.combinedRatingStated}%</b></>}
          </div>
        )}

        {/* AI section - gate on medium/high confidence */}
        {parsed && looksLikeVA && (fpConfidence === "medium" || fpConfidence === "high") && (
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
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 11, color: "#9e9e9e" }}>
                  ⚠️ This summary is for informational purposes only. It is not legal advice.
                </div>

                <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, whiteSpace: "pre-wrap", maxHeight: 260, overflow: "auto" }}>
                  {aiText}
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={onAiSummary} disabled={aiBusy || !parsed}>
                    {aiBusy ? "Summarizing…" : "Re-run Summary"}
                  </button>
                  <button
                    onClick={async () => { try { await navigator.clipboard.writeText(aiText); } catch {} }}
                  >
                    Copy Text
                  </button>
                </div>

                <div style={{ fontSize: 11, color: "#9e9e9e" }}>
                  ⚠️ This summary is for informational purposes only. It is not legal advice.
                </div>
              </div>
            )}
          </div>
        )}

        {parsed && (!looksLikeVA || fpConfidence === "low") && (
          <div style={{ background: "#FFF8E1", border: "1px solid #FFECB3", color: "#7A4F01", padding: 12, borderRadius: 8 }}>
            This doesn’t appear to be a VA decision letter. To protect your privacy and keep this free,
            AI analysis is only available for recognized VA decision letters.
            <div style={{ marginTop: 6, fontSize: 12, color: "#7a7a7a" }}>
              Tips: Look for headings like “Decision”, “Evidence”, “Reasons for Decision”, and phrases like “Diagnostic Code”,
              “Combined Rating”, or “Effective Date”.
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
              href="https://buymeacoffee.com/kairobox"
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

const bannerGood: React.CSSProperties = { background: "#E8F5E9", border: "1px solid #C8E6C9", color: "#256029", padding: 12, borderRadius: 8 };
const bannerWarn: React.CSSProperties = { background: "#FFF8E1", border: "1px solid #FFECB3", color: "#7A4F01", padding: 12, borderRadius: 8 };
