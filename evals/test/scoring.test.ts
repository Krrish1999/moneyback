import { describe, expect, it } from "vitest";
import type { ExtractedClaimFacts } from "@moneyback/prompts";
import {
  caseFieldScore,
  dateMatch,
  identifierMatch,
  matchByKind,
  moneyMatch,
  multisetF1,
  normaliseText,
  scoreExtraction,
  SCORED_FIELDS,
  summarise,
  textMatch,
} from "../runner/scoring";

describe("moneyMatch (integer paise, exact)", () => {
  it("matches identical paise", () => expect(moneyMatch(34218050, 34218050)).toBe(true));
  it("misses when paise are rounded off", () => expect(moneyMatch(34218050, 34218000)).toBe(false));
  it("misses rupees given instead of paise", () => expect(moneyMatch(18450000, 184500)).toBe(false));
  it("misses a non-integer value", () => expect(moneyMatch(100, 100.0001)).toBe(false));
  it("matches zero", () => expect(moneyMatch(0, 0)).toBe(true));
});

describe("dateMatch (ISO date, exact)", () => {
  it("matches the same date", () => expect(dateMatch("2026-01-02", "2026-01-02")).toBe(true));
  it("misses swapped day and month", () => expect(dateMatch("2026-01-02", "2026-02-01")).toBe(false));
  it("misses a non-ISO rendering of the same date", () => expect(dateMatch("2026-01-02", "02/01/2026")).toBe(false));
  it("misses a datetime", () => expect(dateMatch("2026-01-02", "2026-01-02T00:00:00Z")).toBe(false));
});

describe("text and identifier normalisation", () => {
  it("ignores case, punctuation and extra whitespace", () => {
    expect(textMatch("Example City Hospital, Pune", "EXAMPLE  CITY HOSPITAL - PUNE")).toBe(true);
  });
  it("expands common abbreviations", () => {
    expect(normaliseText("Sample General Insurance Co. Ltd.")).toBe("sample general insurance company limited");
    expect(textMatch("Sample General Insurance Co. Ltd.", "Sample General Insurance Company Limited")).toBe(true);
    expect(textMatch("A & B Hospital", "A and B hospital")).toBe(true);
  });
  it("still misses different words", () => {
    expect(textMatch("Acute calculous cholecystitis", "Chronic calculous cholecystitis")).toBe(false);
  });
  it("keeps non-Latin letters (Hindi)", () => expect(normaliseText("मधुमेह, टाइप 2")).toBe("मधुमेह टाइप 2"));
  it("identifiers ignore case and whitespace but not punctuation", () => {
    expect(identifierMatch("SMPL-HI-0000001", " smpl-hi-0000001 ")).toBe(true);
    expect(identifierMatch("SMPL-HI-0000001", "SMPL-HI-0000010")).toBe(false);
    expect(identifierMatch("SMPL-HI-0000001", "SMPLHI0000001")).toBe(false);
  });
});

describe("null handling", () => {
  it("expected null + actual null is correct for every kind", () => {
    for (const kind of ["money", "date", "enum", "identifier", "text"] as const) {
      expect(matchByKind(kind, null, null)).toBe(true);
    }
  });
  it("a guessed value where null was expected is a miss", () => {
    expect(moneyMatch(null, 50000000)).toBe(false);
    expect(dateMatch(null, "2026-01-01")).toBe(false);
  });
  it("a missing value where one was expected is a miss", () => {
    expect(moneyMatch(0, null)).toBe(false); // 0 paise is a real value, not "absent"
    expect(textMatch("Enteric fever", null)).toBe(false);
  });
  it("wrong types are a miss, not a crash", () => {
    expect(matchByKind("money", 100, "100")).toBe(false);
    expect(matchByKind("text", "abc", 42)).toBe(false);
  });
});

describe("multisetF1", () => {
  it("both empty is a perfect score", () => expect(multisetF1([], [])).toBe(1));
  it("one side empty scores 0", () => {
    expect(multisetF1(["a"], [])).toBe(0);
    expect(multisetF1([], ["a"])).toBe(0);
  });
  it("is order-independent", () => expect(multisetF1(["a", "b"], ["b", "a"])).toBe(1));
  it("gives partial credit", () => expect(multisetF1(["a", "b"], ["a", "c"])).toBeCloseTo(0.5));
  it("counts duplicates", () => expect(multisetF1(["a"], ["a", "a"])).toBeCloseTo(2 / 3));
});

const field = <T>(value: T | null) => ({ value, confidence: 1, source_document: value === null ? null : "doc_1" });
function facts(over: Partial<ExtractedClaimFacts> = {}): ExtractedClaimFacts {
  return {
    insurer_name: field("Sample General Insurance Co. Ltd."),
    policy_number: field("SMPL-HI-0000001"),
    policy_type: field("individual"),
    sum_insured: field(50000000),
    policy_start_date: field("2025-04-01"),
    claim_number: field("SMPL-CLM-1"),
    claim_type: field("reimbursement"),
    hospital_name: field("Example Hospital"),
    admission_date: field("2026-02-10"),
    discharge_date: field("2026-02-14"),
    diagnosis: field("Enteric fever"),
    amount_claimed: field(100000),
    amount_paid: field(0),
    amount_disallowed: field(null),
    rejection_letter_date: field("2026-03-05"),
    rejection_reasons: [
      { quote: "x", code: "waiting_period", amount_disallowed: null, confidence: 1, source_document: "doc_1" },
    ],
    policy_clauses_cited: [{ clause: "Clause 4.1", text: null, confidence: 1, source_document: "doc_1" }],
    ...over,
  };
}

describe("scoreExtraction + summarise", () => {
  it("a perfect output scores 1 on every field", () => {
    const scores = scoreExtraction(facts(), facts());
    expect(scores.map((s) => s.field)).toEqual(SCORED_FIELDS);
    expect(scores.every((s) => s.score === 1)).toBe(true);
  });
  it("ignores confidence and source_document", () => {
    const actual = facts({ diagnosis: { value: "Enteric fever", confidence: 0.2, source_document: "doc_9" } });
    expect(scoreExtraction(facts(), actual).every((s) => s.score === 1)).toBe(true);
  });
  it("scores each field separately and averages into an overall score", () => {
    const actual = facts({ sum_insured: field(5000000), policy_clauses_cited: [] });
    const scores = scoreExtraction(facts(), actual);
    expect(scores.find((s) => s.field === "sum_insured")?.score).toBe(0);
    expect(scores.find((s) => s.field === "policy_clauses_cited.clause")?.score).toBe(0);
    const summary = summarise([{ caseId: "c1", fields: scores }]);
    expect(summary.overall).toBeCloseTo((SCORED_FIELDS.length - 2) / SCORED_FIELDS.length);
    expect(summary.perField.find((f) => f.field === "sum_insured")?.misses).toEqual(["c1"]);
  });
  it("a case whose output failed to parse scores 0 everywhere", () => {
    const r = { caseId: "bad", parseError: "no_json", fields: [] };
    expect(caseFieldScore(r, "diagnosis")).toBe(0);
    const summary = summarise([r, { caseId: "good", fields: scoreExtraction(facts(), facts()) }]);
    expect(summary.overall).toBeCloseTo(0.5);
  });
});
