// -------- Types --------
export type ConditionRow = {
  name: string;
  ratingPercent?: number;
  diagnosticCode?: string;
  effectiveDate?: string;   // as text as-found; we’ll normalize later
  rationaleSnippet?: string;
};

export type ParsedDecision = {
  conditions: ConditionRow[];
  combinedRatingStated?: number;
  effectiveDates: string[];      // all detected “effective …” dates (deduped)
  diagnosticCodes: string[];     // all DCs seen
  rawSections: {
    decision?: string;
    evidence?: string;
    reasons?: string;
    references?: string;
    full: string;                // normalized full text
  };
  confidence: "high" | "medium" | "low";
};

// -------- Helpers --------
const MONTHS = "(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const DATE_LONG = new RegExp(`\\b${MONTHS}\\s+\\d{1,2},\\s+\\d{4}\\b`, "i");
const DATE_ISO = /\b\d{4}-\d{2}-\d{2}\b/;

function normalizeText(input: string) {
  // Keep your page markers if present (“--- Page N ---”)
  return input
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function toLines(s: string) {
  return s.split(/\n+/);
}

function sliceSections(full: string) {
  // Grab common headings, case-insensitive; tolerate : after headings
  const re = /\n\s*(DECISION|EVIDENCE|REASONS(?:\s+FOR\s+DECISION|(?:\s+AND)?\s+BASES)?|REFERENCES)\s*:?\s*\n/gi;

  const marks: { name: string; idx: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec("\n" + full + "\n")) !== null) {
    marks.push({ name: m[1].toUpperCase(), idx: m.index });
  }
  const getSlice = (name: string) => {
    const start = marks.find((x) => x.name.startsWith(name))?.idx;
    if (start == null) return undefined;
    // Find next mark after start
    const next = marks.find((x) => x.idx > start)?.idx ?? full.length;
    return full.slice(start, next).trim();
  };

  return {
    decision: getSlice("DECISION"),
    evidence: getSlice("EVIDENCE"),
    reasons: getSlice("REASONS"),
    references: getSlice("REFERENCES"),
  };
}

function dedupe<T>(arr: T[]) {
  return [...new Set(arr)];
}

function findAll(re: RegExp, s: string): RegExpExecArray[] {
  const out: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  while ((m = r.exec(s)) !== null) out.push(m);
  return out;
}

// -------- Parsers --------
export function parseDecision(rawText: string): ParsedDecision {
  const full = normalizeText(rawText);
  const sections = sliceSections(full);
  const lower = full.toLowerCase();

  // Combined rating
  let combinedRatingStated: number | undefined;
  {
    const m = /combined\s+(?:evaluation|rating)\s+(?:is|of)\s+(\d{1,3})\s*percent/i.exec(full);
    if (m) combinedRatingStated = clampPct(m[1]);
  }

  // Effective dates (global “effective … DATE”)
  const effectiveDates: string[] = dedupe([
    ...findAll(new RegExp(`effective\\s+(?:date\\s+of\\s+)?(${DATE_LONG.source})`, "gi"), full).map((m) => m[1]),
    ...findAll(new RegExp(`effective\\s+(?:date\\s+of\\s+)?(${DATE_ISO.source})`, "gi"), full).map((m) => m[1]),
  ]);

  // Diagnostic codes (global)
  const diagnosticCodes = dedupe(findAll(/diagnostic\s*code\s*(\d{4})/gi, full).map((m) => m[1]));

  // Condition candidates: scan DECISION + REASONS text lines
  const conditionBlocks: string[] = [];
  if (sections.decision) conditionBlocks.push(sections.decision);
  if (sections.reasons) conditionBlocks.push(sections.reasons);

  const conditions: ConditionRow[] = [];

  const ratingNearRe = /(\d{1,3})\s*percent(?:\s*(?:evaluation|rating|disabling))?/i;
  const dcNearRe = /diagnostic\s*code\s*(\d{4})/i;
  const effNearRe = new RegExp(`effective\\s+(?:date\\s+of\\s+)?(${DATE_LONG.source}|${DATE_ISO.source})`, "i");

  for (const block of conditionBlocks) {
    // Lines that often state condition outcomes:
    const lines = toLines(block);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Common phrasings
      let condMatch: RegExpExecArray | null =
        /service\s+connection\s+for\s+(.+?)\s+is\s+(granted|denied)/i.exec(line) ||
        /(increase|evaluation)\s+of\s+(.+?)\s+is\s+(granted|denied)/i.exec(line) ||
        /(?:a|an)\s+(\d{1,3})\s*percent\s+(?:evaluation|rating)\s+(?:is\s+assigned\s+for|for)\s+(.+?)\b/i.exec(line) ||
        /for\s+(.+?),\s+(?:a|an)\s+(\d{1,3})\s*percent\s+(?:evaluation|rating)\s+is\s+assigned/i.exec(line);

      if (!condMatch) continue;

      // Normalize name/rating from various capture shapes
      let name = "";
      let ratingPercent: number | undefined;

      if (condMatch[1] && condMatch[2] && condMatch[0].toLowerCase().includes("service connection")) {
        name = cleanCond(condMatch[1]);
      } else if (condMatch[1] && condMatch[2] && condMatch[0].toLowerCase().includes("increase")) {
        name = cleanCond(condMatch[2]);
      } else if (condMatch[1] && condMatch[2]) {
        // Either “A 30 percent … for PTSD” (1=30,2=PTSD) or the inverse match
        const n = Number(condMatch[1]);
        if (!Number.isNaN(n)) {
          ratingPercent = clampPct(n);
          name = cleanCond(condMatch[2]);
        } else {
          // “for PTSD, a 30 percent …”
          name = cleanCond(condMatch[1]);
          const n2 = Number(condMatch[2]);
          ratingPercent = Number.isNaN(n2) ? undefined : clampPct(n2);
        }
      }

      // Look nearby (current + next 2 lines) for DC/effective/rating if missing
      const neigh = [line, lines[i + 1] ?? "", lines[i + 2] ?? ""].join(" ");

      if (ratingPercent == null) {
        const r = ratingNearRe.exec(neigh);
        if (r) ratingPercent = clampPct(r[1]);
      }
      const d = dcNearRe.exec(neigh);
      const e = effNearRe.exec(neigh);

      // Grab a short rationale snippet (current + next line)
      const rationaleSnippet = [line, lines[i + 1] ?? ""]
        .join(" ")
        .split(/(?<=[\.\?!])\s+/)
        .slice(0, 2)
        .join(" ")
        .trim();

      if (name) {
        conditions.push({
          name,
          ratingPercent,
          diagnosticCode: d?.[1],
          effectiveDate: e?.[1],
          rationaleSnippet,
        });
      }
    }
  }

  // If no explicit conditions found, fallback: look for “percent … for X” patterns anywhere
  if (conditions.length === 0) {
    const mAll = findAll(/(?:a|an)\s+(\d{1,3})\s*percent\s+(?:evaluation|rating)\s+(?:is\s+assigned\s+for|for)\s+(.+?)\b/gi, full);
    for (const m of mAll) {
      conditions.push({
        name: cleanCond(m[2]),
        ratingPercent: clampPct(m[1]),
      });
    }
  }

  // Confidence score
  const hasAnchors =
    !!(sections.decision || sections.reasons || sections.evidence);
  const hasAtLeastOneRating = conditions.some((c) => c.ratingPercent != null);
  const hasAnyEffective = effectiveDates.length > 0 || conditions.some((c) => c.effectiveDate);
  const confidence: ParsedDecision["confidence"] =
    hasAnchors && hasAtLeastOneRating && (hasAnyEffective || combinedRatingStated != null)
      ? "high"
      : hasAnchors || hasAtLeastOneRating
      ? "medium"
      : "low";

  return {
    conditions,
    combinedRatingStated,
    effectiveDates: dedupe(effectiveDates),
    diagnosticCodes,
    rawSections: {
      full,
      decision: sections.decision,
      evidence: sections.evidence,
      reasons: sections.reasons,
      references: sections.references,
    },
    confidence,
  };
}

function cleanCond(s: string) {
  return s
    .replace(/\(also\s+claimed\s+as.+?\)/i, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[.,;:]+$/, "")
    .trim();
}

function clampPct(v: string | number) {
  const n = typeof v === "number" ? v : parseInt(v as string, 10);
  return Math.max(0, Math.min(100, n));
}

// --- VA fingerprint / guardrail ---
// Heuristic check to prevent "any random PDF" from being analyzed.
// Uses both the raw text and what our parser found.

export type Fingerprint = {
  looksLikeVA: boolean;
  score: number; // 0–100
  confidence: "low" | "medium" | "high";
  signals: string[];
};

// Heuristic scoring — tuned for VA decision letters
export function assessVAFingerprint(raw: string, parsed: ParsedDecision): Fingerprint {
  const text = raw.toLowerCase();
  let score = 0;
  const signals: string[] = [];

  const hit = (cond: boolean, pts: number, label: string) => {
    if (cond) { score += pts; signals.push(label); }
  };

  // Strong indicators
  hit(/\bdepartment of veterans affairs\b/.test(text), 20, "Header: Department of Veterans Affairs");
  hit(/\bdecision\b/.test(text) && /(evidence|reasons?\s+for\s+decision)/i.test(raw), 20, "Sections: Decision + Evidence/Reasons");
  hit(/\bdiagnostic code\b/i.test(raw), 15, "Mentions Diagnostic Code");
  hit(/\bcombined (rating|evaluation)\b/i.test(raw), 10, "Combined rating stated");
  hit(/\beffective date\b/i.test(raw), 10, "Effective date present");
  hit(/\bservice[- ]connection(ed)?\b/i.test(raw), 10, "Service connection wording");
  hit(/\b(\d{1,3})\s?%/.test(raw), 10, "Percent ratings present");
  hit((parsed?.conditions?.length ?? 0) > 0, 10, "Conditions parsed");

  // Light bonuses
  hit(raw.split(/\s+/).length > 400, 5, "Length > 400 words");
  hit(/page\s+\d+\s+of\s+\d+/i.test(raw), 5, "Page x of y footer");

  let confidence: "low" | "medium" | "high" = "low";
  if (score >= 55) confidence = "high";
  else if (score >= 35) confidence = "medium";

  const looksLikeVA = score >= 35; // gate at medium+
  return { looksLikeVA, score, confidence, signals };
}

