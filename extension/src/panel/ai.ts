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

function getOpenAiKey(): string | null {
  // Vite injects import.meta.env.VITE_... variables at build time
  // TypeScript's type for import.meta.env might need a declaration for VITE_OPENAI_KEY;
  // if so, you can add it in src/env.d.ts
  // return string or null if missing.
  // @ts-ignore
  return import.meta.env.VITE_OPENAI_KEY ?? null;
}

export async function requestAiSummary(payload: AiPayload): Promise<string> {
  const key = getOpenAiKey();
  if (!key) {
    throw new Error(
      "OpenAI API key not found. For development, create a .env with VITE_OPENAI_KEY=sk-... in the extension folder."
    );
  }

  const client = new OpenAI({ apiKey: key, dangerouslyAllowBrowser: true });

  const prompt = `
You are an assistant that explains VA disability decision letters in plain English.

Document text (truncated):
---
${payload.rawText.slice(0, 8000)}
---

Parsed fields:
- Conditions: ${payload.parsed.conditions.map((c) => `${c.name} (${c.ratingPercent ?? "?"}%)`).join("; ")}
- Combined rating: ${payload.parsed.combinedRatingStated ?? "?"}
- Effective dates: ${payload.parsed.effectiveDates.join(", ") || "?"}

Instructions:
- Summarize the decision in plain English for a veteran.
- Mention each condition and the rating it received.
- Note the combined rating if given.
- Point out effective dates.
- Keep it factual, short paragraphs, clear language.
- Do not provide legal advice.
`;

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini", // or whichever model you choose
    messages: [{ role: "user", content: prompt }],
    max_tokens: 500,
  });

  return response.choices?.[0]?.message?.content?.trim() ?? "No summary generated.";
}
