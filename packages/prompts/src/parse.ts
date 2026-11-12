import { z } from "zod";
import { ExtractedClaimFacts } from "./extraction";

export type ParseExtractionError =
  | { kind: "no_json"; message: string }
  | { kind: "invalid_json"; message: string }
  | { kind: "schema_mismatch"; message: string; issues: { path: string; message: string }[] }
  /** More than one different object in the reply fits the schema. We never pick one: retry or send to a person. */
  | { kind: "ambiguous"; message: string };

export type ParseExtractionResult =
  | { ok: true; data: ExtractedClaimFacts }
  | { ok: false; error: ParseExtractionError };

/** Longest model reply we will scan. A real extraction is a few thousand characters. */
const MAX_REPLY_CHARS = 200_000;
/** Most brace-delimited blocks we will try, so a reply made of braces cannot make this slow. */
const MAX_BLOCKS = 500;

type Scan = {
  /** Text of every top-level block that is a JSON object, in order. */
  objects: string[];
  /** A balanced `{…}` block was found that is not JSON. */
  sawNonJsonBlock: boolean;
  /** A `{` was opened and never closed (cut-off output). */
  truncated: boolean;
};

/** Index of the `}` that closes the `{` at `start`, or -1. Braces inside JSON strings are skipped. */
function closingBrace(text: string, start: number): number {
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
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Finds every JSON object in the reply, wherever it sits: bare, inside any ``` fence, or after prose.
 * A balanced block that is not JSON (prose such as "{doc_1}") is skipped and searched inside.
 * Objects nested inside a JSON object are not candidates: only the outermost one is.
 */
function scanForObjects(raw: string): Scan {
  const text = raw.length > MAX_REPLY_CHARS ? raw.slice(0, MAX_REPLY_CHARS) : raw;
  const scan: Scan = { objects: [], sawNonJsonBlock: false, truncated: raw.length > MAX_REPLY_CHARS };
  let from = 0;
  for (let blocks = 0; blocks < MAX_BLOCKS; blocks++) {
    const start = text.indexOf("{", from);
    if (start === -1) return scan;
    const end = closingBrace(text, start);
    if (end === -1) {
      scan.truncated = true;
      return scan;
    }
    const block = text.slice(start, end + 1);
    let isObject = false;
    try {
      const value: unknown = JSON.parse(block);
      isObject = typeof value === "object" && value !== null && !Array.isArray(value);
    } catch {
      // not JSON
    }
    if (isObject) {
      scan.objects.push(block);
      from = end + 1;
    } else {
      scan.sawNonJsonBlock = true;
      from = start + 1; // look inside it
    }
  }
  scan.truncated = true; // gave up: treat like cut-off output
  return scan;
}

/** The first JSON object in raw model text, or null. Kept for callers that only need to look; not used for parsing. */
export function extractJsonText(raw: string): string | null {
  return scanForObjects(raw).objects[0] ?? null;
}

/**
 * Parse and validate raw model output for extraction. Never throws. On failure, the caller retries
 * (passing `error.issues` back to the model) or asks the user.
 *
 * Every JSON object in the reply is checked against the schema (security review M-1):
 * - exactly one fits → that is the answer, wherever it sits in the reply;
 * - several different ones fit → `ambiguous`. A document can carry a ready-made JSON block that the model
 *   echoes, so we never choose between two fitting objects, whichever comes first;
 * - none fits → the most specific error we can give.
 */
export function parseExtraction(rawModelText: string): ParseExtractionResult {
  const scan = scanForObjects(rawModelText);

  const fitting = new Map<string, ExtractedClaimFacts>();
  let closest: { text: string; error: z.ZodError } | null = null;
  for (const text of scan.objects) {
    const result = ExtractedClaimFacts.safeParse(JSON.parse(text));
    if (result.success) fitting.set(JSON.stringify(result.data), result.data);
    else if (!closest || text.length > closest.text.length) closest = { text, error: result.error };
  }

  if (fitting.size === 1) return { ok: true, data: [...fitting.values()][0]! };
  if (fitting.size > 1) {
    return {
      ok: false,
      error: { kind: "ambiguous", message: `${fitting.size} different objects in the model output fit the schema` },
    };
  }
  if (closest) {
    return {
      ok: false,
      error: {
        kind: "schema_mismatch",
        message: z.prettifyError(closest.error),
        issues: closest.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
    };
  }
  if (scan.sawNonJsonBlock && !scan.truncated) {
    return { ok: false, error: { kind: "invalid_json", message: "Found {…} blocks in model output, but none is valid JSON" } };
  }
  return { ok: false, error: { kind: "no_json", message: "No complete JSON object found in model output" } };
}
