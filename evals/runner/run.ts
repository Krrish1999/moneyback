/**
 * Extraction eval runner. Usage (from the repo root):
 *
 *   pnpm eval                          score recorded outputs for every golden case
 *   pnpm eval --threshold 0.95         fail (exit 1) when the overall score is below 0.95 (default 0.9)
 *   pnpm eval --case <case-id>         score one case
 *   pnpm eval --include-private        also score evals/golden/private/ (real cases, git-ignored)
 *   pnpm eval --live                   reserved: call the model live (not implemented yet)
 *
 * EVAL_THRESHOLD in the environment sets the default threshold.
 */
import { parseArgs } from "node:util";
import { EXTRACTION_PROMPT_VERSION } from "@moneyback/prompts";
import { loadGoldenCases, parseModelOutput } from "./golden";
import {
  SCALAR_FIELD_KINDS,
  scoreExtraction,
  summarise,
  type CaseResult,
  type ScoredField,
} from "./scoring";

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: {
    threshold: { type: "string" },
    live: { type: "boolean", default: false },
    case: { type: "string" },
    "include-private": { type: "boolean", default: false },
  },
});

if (values.live) {
  console.log("--live: not implemented (live model calls arrive with B-05). Run without --live to score recorded outputs.");
  process.exit(2);
}

const threshold = Number(values.threshold ?? process.env.EVAL_THRESHOLD ?? 0.9);
if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
  console.error(`Invalid threshold "${values.threshold ?? process.env.EVAL_THRESHOLD}": use a number between 0 and 1.`);
  process.exit(2);
}

const cases = await loadGoldenCases({ includePrivate: values["include-private"], only: values.case });
if (cases.length === 0) {
  console.error(values.case ? `No golden case named "${values.case}".` : "No golden cases found in evals/golden.");
  process.exit(2);
}

const results: CaseResult[] = cases.map((c) => {
  const parsed = parseModelOutput(c.recordedOutputText);
  if (!parsed.ok) return { caseId: c.meta.id, parseError: parsed.error, fields: [] };
  return { caseId: c.meta.id, fields: scoreExtraction(c.meta.expected, parsed.facts) };
});

const summary = summarise(results);

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const kindOf = (f: ScoredField) => (f in SCALAR_FIELD_KINDS ? SCALAR_FIELD_KINDS[f as keyof typeof SCALAR_FIELD_KINDS] : "list-F1");
const fmt = (v: unknown) => (v === undefined ? "-" : JSON.stringify(v));

console.log(`\nMoneyBack extraction eval — ${cases.length} golden case(s), recorded outputs`);
console.log(`Parser: @moneyback/prompts parseExtraction · current prompt: ${EXTRACTION_PROMPT_VERSION}\n`);

// Per-field table: one column per case (✓ / ✗ / F1) plus field accuracy.
const caseCols = results.map((_, i) => `C${i + 1}`);
const fieldW = Math.max(...summary.perField.map((f) => f.field.length), "field".length);
const header = ["field".padEnd(fieldW), "kind".padEnd(10), ...caseCols.map((c) => c.padStart(6)), "accuracy".padStart(9)].join("  ");
console.log(header);
console.log("-".repeat(header.length));
for (const f of summary.perField) {
  const cells = results.map((r) => {
    if (r.parseError) return "ERR".padStart(6);
    const s = r.fields.find((x) => x.field === f.field)?.score ?? 0;
    return (s === 1 ? "ok" : s === 0 ? "MISS" : s.toFixed(2)).padStart(6);
  });
  console.log([f.field.padEnd(fieldW), kindOf(f.field).padEnd(10), ...cells, pct(f.accuracy).padStart(9)].join("  "));
}
console.log("-".repeat(header.length));
console.log(
  ["case score".padEnd(fieldW), "".padEnd(10), ...summary.perCase.map((c) => pct(c.score).padStart(6)), ""].join("  "),
);

console.log("\nCases:");
results.forEach((r, i) => console.log(`  C${i + 1} = ${r.caseId}`));

const misses = results.flatMap((r) =>
  r.parseError
    ? [`  ${r.caseId}: model output did not parse: ${r.parseError.split("\n")[0]}`]
    : r.fields
        .filter((f) => f.score < 1)
        .map((f) => `  ${r.caseId} · ${f.field}: expected ${fmt(f.expected)}, got ${fmt(f.actual)}`),
);
console.log(misses.length ? `\nMisses (${misses.length}):\n${misses.join("\n")}` : "\nMisses: none");

console.log("\nNot scored yet: verdict agreement and citations outside the rules library (arrive with B-06).");
console.log(`\nOverall score: ${pct(summary.overall)}  (threshold ${pct(threshold)})`);

if (summary.overall < threshold) {
  console.log("RESULT: FAIL — below threshold");
  process.exit(1);
}
console.log("RESULT: PASS");
