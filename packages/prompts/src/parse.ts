import { z } from "zod";
import { ExtractedClaimFacts } from "./extraction";

export type ParseExtractionError =
  | { kind: "no_json"; message: string }
  | { kind: "invalid_json"; message: string }
  | { kind: "schema_mismatch"; message: string; issues: { path: string; message: string }[] };

export type ParseExtractionResult =
  | { ok: true; data: ExtractedClaimFacts }
  | { ok: false; error: ParseExtractionError };

/**
 * Find the JSON object in raw model text. Accepts bare JSON, JSON inside a ```json fence, or JSON surrounded by
 * prose (the first balanced top-level object is taken; braces inside strings are handled).
 */
export function extractJsonText(raw: string): string | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const text = fenced?.[1] ?? raw;
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null; // unbalanced — truncated output
}

/**
 * Parse and validate raw model output for extraction. Never throws. On failure, the caller retries
 * (passing `error.issues` back to the model) or asks the user.
 */
export function parseExtraction(rawModelText: string): ParseExtractionResult {
  const jsonText = extractJsonText(rawModelText);
  if (jsonText === null) {
    return { ok: false, error: { kind: "no_json", message: "No complete JSON object found in model output" } };
  }
  let value: unknown;
  try {
    value = JSON.parse(jsonText);
  } catch (e) {
    return { ok: false, error: { kind: "invalid_json", message: (e as Error).message } };
  }
  const result = ExtractedClaimFacts.safeParse(value);
  if (!result.success) {
    return {
      ok: false,
      error: {
        kind: "schema_mismatch",
        message: z.prettifyError(result.error),
        issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
    };
  }
  return { ok: true, data: result.data };
}
