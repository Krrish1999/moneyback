import { describe, expect, it } from "vitest";
import { ExtractedClaimFacts } from "@moneyback/prompts";
import { loadGoldenCases, parseModelOutput } from "../runner/golden";

const cases = await loadGoldenCases();

describe("golden cases", () => {
  it("has at least 5 cases covering both claim types", () => {
    expect(cases.length).toBeGreaterThanOrEqual(5);
    expect(new Set(cases.map((c) => c.meta.claim_type))).toEqual(new Set(["cashless", "reimbursement"]));
  });

  it("covers the five sprint-1 rejection reasons", () => {
    const codes = new Set(cases.flatMap((c) => c.meta.rejection_codes));
    for (const code of [
      "pre_existing_disease",
      "waiting_period",
      "non_disclosure",
      "room_rent_cap_proportionate_deduction",
      "documents_missing",
    ] as const) {
      expect(codes).toContain(code);
    }
  });

  describe.each(cases.map((c) => [c.meta.id, c] as const))("%s", (_id, c) => {
    it("is marked synthetic and uses a fictional insurer", () => {
      expect(c.meta.synthetic).toBe(true);
      expect(c.meta.expected.insurer_name.value ?? "").toMatch(/^(Sample|Demo|Example) /);
    });

    it("expected facts are valid ExtractedClaimFacts", () => {
      expect(() => ExtractedClaimFacts.parse(c.meta.expected)).not.toThrow();
    });

    it("expected source documents exist in the case", () => {
      const ids = new Set(c.meta.documents.map((d) => d.id));
      const refs = [
        ...Object.values(c.meta.expected).flatMap((v) =>
          Array.isArray(v) ? v.map((x) => x.source_document) : [(v as { source_document: string | null }).source_document],
        ),
      ].filter((r): r is string => r !== null);
      for (const r of refs) expect(ids).toContain(r);
    });

    it("rejection reason quotes appear verbatim in the cited document", () => {
      const squash = (s: string) => s.replace(/\s+/g, " ");
      for (const r of c.meta.expected.rejection_reasons) {
        expect(squash(c.documents[r.source_document ?? ""] ?? "")).toContain(squash(r.quote));
      }
    });

    it("recorded model output parses with parseExtraction", () => {
      const parsed = parseModelOutput(c.recordedOutputText);
      expect(parsed.ok, parsed.ok ? "" : parsed.error).toBe(true);
    });

    it("contains no real-looking personal identifiers", () => {
      const all = Object.values(c.documents).join("\n") + JSON.stringify(c.meta) + c.recordedOutputText;
      expect(all).not.toMatch(/\b\d{4}\s?\d{4}\s?\d{4}\b/); // Aadhaar-like
      expect(all).not.toMatch(/\b[6-9]\d{9}\b/); // Indian mobile number
      expect(all).not.toMatch(/\b[A-Z]{5}\d{4}[A-Z]\b/); // PAN
      expect(all).not.toMatch(/@(?!moneyback)[a-z0-9-]+\.[a-z]{2,}/i); // email addresses
    });
  });
});
