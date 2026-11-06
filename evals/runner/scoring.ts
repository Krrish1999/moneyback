/**
 * Pure scoring functions for the extraction eval. No I/O here, so everything is unit-tested in test/scoring.test.ts.
 *
 * Rules:
 * - Money (integer paise) and dates (YYYY-MM-DD) must match exactly.
 * - Enums match exactly.
 * - Identifiers (policy / claim numbers) match ignoring case and whitespace.
 * - Free text (names, diagnosis) matches after normalisation (case, punctuation, whitespace, common abbreviations).
 * - Null handling: expected null + actual null = correct; exactly one null = miss. The model must not guess.
 * - Lists (rejection reason codes, clauses cited) are scored with F1 over a multiset; both empty = 1.
 * Confidence and source_document are not scored yet.
 */
import { EXTRACTED_SCALAR_FIELDS, type ExtractedClaimFacts, type ExtractedScalarField } from "@moneyback/prompts";

export type MatchKind = "money" | "date" | "enum" | "identifier" | "text";

export const SCALAR_FIELD_KINDS = {
  insurer_name: "text",
  policy_number: "identifier",
  policy_type: "enum",
  sum_insured: "money",
  policy_start_date: "date",
  claim_number: "identifier",
  claim_type: "enum",
  hospital_name: "text",
  admission_date: "date",
  discharge_date: "date",
  diagnosis: "text",
  amount_claimed: "money",
  amount_paid: "money",
  amount_disallowed: "money",
  rejection_letter_date: "date",
} as const satisfies Record<ExtractedScalarField, MatchKind>;

export const LIST_FIELDS = ["rejection_reasons.code", "policy_clauses_cited.clause"] as const;
export type ListField = (typeof LIST_FIELDS)[number];
export type ScoredField = ExtractedScalarField | ListField;
export const SCORED_FIELDS: readonly ScoredField[] = [...EXTRACTED_SCALAR_FIELDS, ...LIST_FIELDS];

/** null/undefined handling shared by every matcher. Returns undefined when both values are present. */
function nullMatch(expected: unknown, actual: unknown): boolean | undefined {
  const e = expected === null || expected === undefined;
  const a = actual === null || actual === undefined;
  if (e && a) return true;
  if (e !== a) return false;
  return undefined;
}

/** Money in integer paise: exact equality, no tolerance. */
export function moneyMatch(expected: number | null | undefined, actual: number | null | undefined): boolean {
  return nullMatch(expected, actual) ?? (Number.isInteger(actual) && expected === actual);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** ISO calendar date: exact string equality, and the actual value must be YYYY-MM-DD. */
export function dateMatch(expected: string | null | undefined, actual: string | null | undefined): boolean {
  return nullMatch(expected, actual) ?? (ISO_DATE.test(actual as string) && expected === actual);
}

export function enumMatch(expected: string | null | undefined, actual: string | null | undefined): boolean {
  return nullMatch(expected, actual) ?? expected === actual;
}

export function normaliseIdentifier(s: string): string {
  return s.normalize("NFKC").replace(/\s+/g, "").toUpperCase();
}

export function identifierMatch(expected: string | null | undefined, actual: string | null | undefined): boolean {
  return nullMatch(expected, actual) ?? normaliseIdentifier(expected as string) === normaliseIdentifier(actual as string);
}

const ABBREVIATIONS: Record<string, string> = {
  co: "company",
  ltd: "limited",
  pvt: "private",
  hosp: "hospital",
  "&": "and",
};

/** Lowercase, drop punctuation, collapse whitespace, expand a few common abbreviations. */
export function normaliseText(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/&/g, " & ")
    .replace(/[^\p{L}\p{M}\p{N}&]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((t) => ABBREVIATIONS[t] ?? t)
    .join(" ");
}

export function textMatch(expected: string | null | undefined, actual: string | null | undefined): boolean {
  return nullMatch(expected, actual) ?? normaliseText(expected as string) === normaliseText(actual as string);
}

export function matchByKind(kind: MatchKind, expected: unknown, actual: unknown): boolean {
  const n = nullMatch(expected, actual);
  if (n !== undefined) return n;
  // Type mismatch (e.g. a string where paise were expected) is a miss, never a crash.
  switch (kind) {
    case "money":
      return typeof actual === "number" && moneyMatch(expected as number, actual);
    case "date":
      return typeof actual === "string" && dateMatch(expected as string, actual);
    case "enum":
      return typeof actual === "string" && enumMatch(expected as string, actual);
    case "identifier":
      return typeof actual === "string" && identifierMatch(expected as string, actual);
    case "text":
      return typeof actual === "string" && textMatch(expected as string, actual);
  }
}

/** F1 between two multisets of strings. Both empty = 1 (correctly found nothing). */
export function multisetF1(expected: readonly string[], actual: readonly string[]): number {
  if (expected.length === 0 && actual.length === 0) return 1;
  if (expected.length === 0 || actual.length === 0) return 0;
  const remaining = new Map<string, number>();
  for (const e of expected) remaining.set(e, (remaining.get(e) ?? 0) + 1);
  let tp = 0;
  for (const a of actual) {
    const n = remaining.get(a) ?? 0;
    if (n > 0) {
      tp++;
      remaining.set(a, n - 1);
    }
  }
  if (tp === 0) return 0;
  const precision = tp / actual.length;
  const recall = tp / expected.length;
  return (2 * precision * recall) / (precision + recall);
}

export interface FieldScore {
  field: ScoredField;
  /** 0..1 (scalars are 0 or 1; lists are F1). */
  score: number;
  expected: unknown;
  actual: unknown;
}

/** Score one model output against the golden expectation, field by field. */
export function scoreExtraction(expected: ExtractedClaimFacts, actual: ExtractedClaimFacts): FieldScore[] {
  const scores: FieldScore[] = EXTRACTED_SCALAR_FIELDS.map((field) => {
    const e = expected[field].value;
    const a = actual[field].value;
    return { field, score: matchByKind(SCALAR_FIELD_KINDS[field], e, a) ? 1 : 0, expected: e, actual: a };
  });

  const eCodes = expected.rejection_reasons.map((r) => r.code);
  const aCodes = actual.rejection_reasons.map((r) => r.code);
  scores.push({ field: "rejection_reasons.code", score: multisetF1(eCodes, aCodes), expected: eCodes, actual: aCodes });

  const eClauses = expected.policy_clauses_cited.map((c) => normaliseText(c.clause));
  const aClauses = actual.policy_clauses_cited.map((c) => normaliseText(c.clause));
  scores.push({
    field: "policy_clauses_cited.clause",
    score: multisetF1(eClauses, aClauses),
    expected: expected.policy_clauses_cited.map((c) => c.clause),
    actual: actual.policy_clauses_cited.map((c) => c.clause),
  });
  return scores;
}

export interface CaseResult {
  caseId: string;
  /** Present when the model output could not be parsed; the case then scores 0 on every field. */
  parseError?: string;
  fields: FieldScore[];
}

export interface Summary {
  perField: { field: ScoredField; accuracy: number; misses: string[] }[];
  perCase: { caseId: string; score: number }[];
  overall: number;
}

const mean = (xs: readonly number[]) => (xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length);

/** A case whose output failed to parse counts as 0 for every field. */
export function caseFieldScore(result: CaseResult, field: ScoredField): number {
  if (result.parseError) return 0;
  return result.fields.find((f) => f.field === field)?.score ?? 0;
}

export function summarise(results: readonly CaseResult[]): Summary {
  const perField = SCORED_FIELDS.map((field) => {
    const scores = results.map((r) => caseFieldScore(r, field));
    const misses = results.filter((r) => caseFieldScore(r, field) < 1).map((r) => r.caseId);
    return { field, accuracy: mean(scores), misses };
  });
  const perCase = results.map((r) => ({
    caseId: r.caseId,
    score: mean(SCORED_FIELDS.map((f) => caseFieldScore(r, f))),
  }));
  const overall = mean(results.flatMap((r) => SCORED_FIELDS.map((f) => caseFieldScore(r, f))));
  return { perField, perCase, overall };
}
