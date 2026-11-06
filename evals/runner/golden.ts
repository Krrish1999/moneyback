/**
 * Golden case format (schema_version 1). One folder per case under evals/golden/<case-id>/:
 *
 *   case.json              metadata + `expected` (an ExtractedClaimFacts object) — see GoldenCase below
 *   documents/<id>_<type>.txt   plain-text renderings of each input document; ids ("doc_1", ...) are the
 *                               labels the extraction prompt gives the model, and what `source_document` refers to
 *   recorded-output.json   the model's raw response text for this case, scored by default (no live calls)
 *
 * Cases in the repo must be synthetic (`synthetic: true`, invented names, insurers such as "Sample General
 * Insurance Co. Ltd."). Real cases go only in evals/golden/private/ (git-ignored); the runner skips that folder
 * unless --include-private is passed.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ClaimType, ExtractedClaimFacts, RejectionReasonCode, parseExtraction } from "@moneyback/prompts";
import { DocumentType } from "@moneyback/shared";

export const GoldenDocument = z.object({
  id: z.string().regex(/^doc_\d+$/),
  type: DocumentType,
  title: z.string().min(1),
  /** Path relative to the case folder. */
  file: z.string().min(1),
});

export const GoldenCase = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  schema_version: z.literal(1),
  /** Must be true for every case committed to the repo. */
  synthetic: z.boolean(),
  title: z.string().min(1),
  rejection_codes: z.array(RejectionReasonCode).min(1),
  claim_type: ClaimType,
  outcome: z.enum(["rejected", "partly_paid"]),
  notes: z.string().optional(),
  documents: z.array(GoldenDocument).min(1),
  recorded_output: z.object({
    file: z.string().min(1),
    model: z.string().min(1),
    prompt_version: z.string().nullable(),
    recorded_at: z.iso.date(),
  }),
  expected: ExtractedClaimFacts,
});
export type GoldenCase = z.infer<typeof GoldenCase>;

export interface LoadedCase {
  dir: string;
  meta: GoldenCase;
  /** Document id -> plain text. */
  documents: Record<string, string>;
  recordedOutputText: string;
}

export const GOLDEN_DIR = path.resolve(import.meta.dirname, "..", "golden");

export async function loadCase(dir: string): Promise<LoadedCase> {
  const raw = JSON.parse(await readFile(path.join(dir, "case.json"), "utf8"));
  const meta = GoldenCase.parse(raw);
  if (meta.id !== path.basename(dir)) throw new Error(`case.json id "${meta.id}" does not match folder ${dir}`);
  const documents: Record<string, string> = {};
  for (const d of meta.documents) documents[d.id] = await readFile(path.join(dir, d.file), "utf8");
  const recordedOutputText = await readFile(path.join(dir, meta.recorded_output.file), "utf8");
  return { dir, meta, documents, recordedOutputText };
}

export async function loadGoldenCases(opts: { root?: string; includePrivate?: boolean; only?: string } = {}) {
  const root = opts.root ?? GOLDEN_DIR;
  const dirs: string[] = [];
  for (const e of await readdir(root, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    if (e.name === "private") {
      if (!opts.includePrivate) continue;
      for (const p of await readdir(path.join(root, e.name), { withFileTypes: true }))
        if (p.isDirectory()) dirs.push(path.join(root, e.name, p.name));
      continue;
    }
    dirs.push(path.join(root, e.name));
  }
  dirs.sort();
  const selected = opts.only ? dirs.filter((d) => path.basename(d) === opts.only) : dirs;
  return Promise.all(selected.map(loadCase));
}

type ParseResult = { ok: true; facts: ExtractedClaimFacts } | { ok: false; error: string };

/** Parse a raw model response with the AI engineer's `parseExtraction` (the same code production uses). */
export function parseModelOutput(text: string): ParseResult {
  const r = parseExtraction(text);
  return r.ok ? { ok: true, facts: r.data } : { ok: false, error: `${r.error.kind}: ${r.error.message}` };
}
