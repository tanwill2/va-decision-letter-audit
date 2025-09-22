import type { ParsedDecision } from "./parseDecision";

/** Flip this to true when you're ready to wire a real provider */
export const ENABLE_AI = false as const;

export type AiPayload = {
  version: "v1";
  source: "chrome-extension";
  rawText: string;
  parsed: ParsedDecision;
  // room for future fields:
  // userHints?: string;
  // locale?: string;
};

export function buildAiPayload(rawText: string, parsed: ParsedDecision): AiPayload {
  return {
    version: "v1",
    source: "chrome-extension",
    rawText,
    parsed,
  };
}

/**
 * Stub for a future LLM call. For now, returns a placeholder string.
 * When you’re ready, replace the body with a fetch to your backend (or direct provider).
 */
export async function requestAiSummary(_payload: AiPayload): Promise<string> {
  if (!ENABLE_AI) {
    return "AI Summary is coming soon. For privacy, nothing was uploaded.";
  }
  // Example wiring later:
  // const res = await fetch("https://your-api/ai/summary", {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json", Authorization: `Bearer ${YOUR_TOKEN}` },
  //   body: JSON.stringify(_payload),
  // });
  // const data = await res.json();
  // return data.summary as string;
  return "AI summary placeholder.";
}
