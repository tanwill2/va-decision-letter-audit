import type { ParsedDecision } from "./parseDecision";
import OpenAI from "openai";

/** Flip this to true to enable AI summary in dev (use caution for production) */
export const ENABLE_AI = true;

export type AiPayload = {
  version: "v1";
  source: "chrome-extension";
  rawText: string;
  parsed: ParsedDecision;
};

export function buildAiPayload(rawText: string, parsed: ParsedDecision): AiPayload {
  return {
    version: "v1",
    source: "chrome-extension",
    rawText,
    parsed,
  };
}

// --- NEW: constants & helpers ---
const DISCLAIMER_TOP =
  "⚠️ This is a plain-English summary for your information only. It is not legal advice.";
const DISCLAIMER_BOTTOM =
  "⚠️ This is not legal advice. If you need help with an appeal or review, consider contacting a qualified representative.";

const MAX_INPUT_CHARS = 20000;  // keep prompt small to control cost

function getOpenAiKey(): string | null {
  // @ts-ignore injected by Vite
  return import.meta.env.VITE_OPENAI_KEY ?? null;
}

function truncate(s: string, n: number) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) : s;
}

export async function requestAiSummary(payload: AiPayload): Promise<string> {
  const key = getOpenAiKey();
  if (!key) {
    throw new Error(
      "OpenAI API key not found. For development, create a .env with VITE_OPENAI_KEY=sk-... in the extension folder."
    );
  }

  const client = new OpenAI({ apiKey: key, dangerouslyAllowBrowser: true });

  const { parsed } = payload;
  const truncated = truncate(payload.rawText, MAX_INPUT_CHARS);

  // Build compact, structured context for low token usage
  const structuredContext = `
Parsed snapshot:
- Combined rating (stated): ${parsed.combinedRatingStated ?? "not found"}
- Effective dates: ${parsed.effectiveDates.join(", ") || "not found"}
- Conditions:
${parsed.conditions.map(c => `  • ${c.name} | rating: ${c.ratingPercent ?? "?"}% | DC: ${c.diagnosticCode ?? "?"} | effective: ${c.effectiveDate ?? "?"}`).join("\n")}
`;

  const prompt = `
You explain VA disability decision letters in plain English, without legal advice.
Use short sections and bullets. Be concise and specific to this letter.
Do NOT copy long passages from the letter; summarize instead.
If you are running out of space, shorten earlier sections rather than omitting later ones.
You must include ALL sections below, in order.

If a section is missing in the letter, say “Not found”.

Document text (truncated):
---
${truncated}
---

${structuredContext}

Write the summary with EXACTLY these sections (keep them in this order):

1) Overview
- 1-3 short bullets stating the overall outcome (grants/denials/changes).

2) Decisions by condition
- Bullet each condition with: name, rating % (or "not service-connected"), diagnostic code if present, effective date if present.

3) Combined rating
- State the combined rating if present. If not found, say "Not found in this letter."

4) Effective dates
- List important effective dates and what they mean for payments.

5) Favorable findings
- If the letter has Favorable Findings for any denial or section, summarize it. This is imporant. Look for the term "favorable findings."
- If not explicitly present, infer favorable points (e.g., service connection established, condition recognized, effective date maintained, key evidence accepted). Keep it factual.

6) Denials (if any)
- Summarize any conditions or claims that were denied.
- For each, clearly state the condition name and that it was denied.
- If the letter provides a reason (e.g., “not service-connected,” “no evidence of nexus”), briefly restate in plain English.
- If no denials are found, write “No denials in this letter.”

7) What this means in plain English
- 2-4 bullets explaining practical implications (no legal advice).

8) What's missing or unclear
- 1-3 bullets on missing data or ambiguous parts.

Style rules:
- Plain language, short bullets/mini-paragraphs.
- No legal advice or instructions to file. Do not speculate.
- Target about 300-400 words, but ensure all sections are completed.
  If the letter is unusually long, you may go up to ~500 words.
`;

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are a careful assistant that summarizes VA decision letters in plain English. You never give legal advice." },
      { role: "user", content: prompt },
    ],
    max_tokens: 1000,
    temperature: 0.2,
  });

  const body = response.choices?.[0]?.message?.content?.trim() || "No summary generated.";

  const requiredHeaders = [
  "1) Overview",
  "2) Decisions by condition",
  "3) Combined rating",
  "4) Effective dates",
  "5) Favorable findings",
  "6) Denials",
  "7) What this means in plain English",
  "8) What's missing or unclear",
];

const missing = requiredHeaders.filter(h => !body.includes(h));
const note = missing.length
  ? `\n\n— Note: The summary may be condensed. Missing sections: ${missing.join(", ")}.`
  : "";

  // Wrap with disclaimers at top and bottom
  return `${DISCLAIMER_TOP}\n\n${body}${note}\n\n${DISCLAIMER_BOTTOM}`;
}

