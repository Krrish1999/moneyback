import { describe, expect, it } from "vitest";
import { computeDeadlines, DeadlineConfig } from "@moneyback/shared";
import {
  durationToDays,
  findRules,
  isOfficialSourceUrl,
  parseRules,
  Rule,
  RulesLoadError,
  toDeadlineConfig,
  type RuleInput,
} from "../src";
import { loadRules } from "../src/node";

const fixture = (name: string) => new URL(`./fixtures/${name}/`, import.meta.url).pathname;

function loadError(fn: () => unknown): RulesLoadError {
  try {
    fn();
  } catch (e) {
    if (e instanceof RulesLoadError) return e;
    throw e;
  }
  throw new Error("expected RulesLoadError");
}

describe("real rules folder", () => {
  const rules = loadRules();

  it("loads cleanly with 8-12 draft rules", () => {
    expect(rules.length).toBeGreaterThanOrEqual(8);
    expect(rules.length).toBeLessThanOrEqual(12);
  });

  it("every rule is a draft, dated 2026-11-06, with an official https source", () => {
    for (const r of rules) {
      expect(r.status, r.id).toBe("draft");
      expect(r.date_checked, r.id).toBe("2026-11-06");
      expect(isOfficialSourceUrl(r.source_url), r.id).toBe(true);
    }
  });

  it("covers the escalation path and key reason codes", () => {
    expect(findRules(rules, { forum: "insurer_gro" }).length).toBeGreaterThan(0);
    expect(findRules(rules, { forum: "insurance_ombudsman" }).length).toBeGreaterThan(0);
    const nd = findRules(rules, { reasonCode: "non_disclosure" }).map((r) => r.id);
    expect(nd).toContain("moratorium-60-months");
    const docs = findRules(rules, { reasonCode: "documents_missing" }).map((r) => r.id);
    expect(docs).toContain("no-rejection-for-want-of-documents");
    // a reason-specific rule does not leak into unrelated reasons
    expect(findRules(rules, { reasonCode: "room_rent_cap_proportionate_deduction" }).map((r) => r.id)).not.toContain(
      "moratorium-60-months",
    );
  });

  it("findRules filters by status (production uses verified only)", () => {
    expect(findRules(rules, { statuses: ["verified"] })).toEqual([]);
    expect(findRules(rules, { statuses: ["draft"] })).toHaveLength(rules.length);
  });

  it("toDeadlineConfig uses only verified rules by default, so drafts produce gaps", () => {
    const r = toDeadlineConfig(rules, { forumOrder: ["insurer_gro", "insurance_ombudsman"] });
    expect(r.config).toBeNull();
    expect(r.gaps.some((g) => g.field === "waitDaysBeforeEscalation")).toBe(true);
  });

  it("toDeadlineConfig (drafts) builds a valid config for insurer -> ombudsman that the engine accepts", () => {
    const r = toDeadlineConfig(rules, { forumOrder: ["insurer_gro", "insurance_ombudsman"], includeDrafts: true });
    expect(r.config).not.toBeNull();
    expect(DeadlineConfig.safeParse(r.config).success).toBe(true);
    expect(r.config!.forums.insurer_gro).toEqual({
      waitDaysBeforeEscalation: 31, // "one month", rounded up
      escalateEarlyOnReply: true,
      maxDaysToFile: null,
    });
    expect(r.config!.forums.insurance_ombudsman?.maxDaysToFile).toBe(365); // "one year", rounded down
    expect(r.sources.insurer_gro?.wait).toBe("ombudsman-wait-one-month-after-insurer");
    // insurer_gro has no filing-window rule -> reported, not silently treated as "no limit"
    expect(r.gaps).toEqual([expect.objectContaining({ forum: "insurer_gro", field: "maxDaysToFile" })]);

    const out = computeDeadlines({
      currentForum: "insurer_gro",
      dates: { complaintSentAt: "2026-01-10" },
      asOf: "2026-03-01",
      config: r.config!,
    });
    expect(out).toMatchObject({
      nextForum: "insurance_ombudsman",
      earliestEscalationDate: "2026-02-10",
      lastFilingDate: "2027-02-10",
      canEscalateNow: true,
    });
  });

  it("toDeadlineConfig reports the missing Bima Bharosa -> Ombudsman wait instead of inventing one", () => {
    const r = toDeadlineConfig(rules, {
      forumOrder: ["insurer_gro", "bima_bharosa", "insurance_ombudsman"],
      includeDrafts: true,
    });
    expect(r.config).toBeNull();
    expect(r.gaps).toContainEqual(expect.objectContaining({ forum: "bima_bharosa", field: "waitDaysBeforeEscalation" }));
    expect(r.sources.insurer_gro?.wait).toBe("bima-bharosa-escalation-after-two-weeks");
  });
});

describe("loader rejects bad rule files", () => {
  it("malformed YAML", () => {
    const e = loadError(() => loadRules(fixture("bad-yaml")));
    expect(e.problems[0]).toMatch(/^broken\.yaml: YAML/);
  });

  it("schema errors, listing every problem", () => {
    const e = loadError(() => loadRules(fixture("bad-schema")));
    const text = e.problems.join("\n");
    for (const field of ["applies_to", "forum", "source_url", "date_checked", "status"]) {
      expect(text).toContain(`bad-fields.yaml: ${field}`);
    }
  });

  it("duplicate ids across files", () => {
    const e = loadError(() => loadRules(fixture("duplicate")));
    expect(e.problems.join("\n")).toMatch(/duplicate rule id "sample-rule"/);
  });

  it("non-official source URLs", () => {
    const e = loadError(() => loadRules(fixture("unofficial-source")));
    expect(e.problems.join("\n")).toMatch(/source_url must be an https URL on an official host/);
  });

  it("duplicate YAML keys and file name / id mismatch", () => {
    const text = `id: a-rule\nid: b-rule\n`;
    expect(() => parseRules([{ path: "a-rule.yaml", text }])).toThrow(RulesLoadError);
    const valid = loadRules(fixture("valid"));
    expect(valid.map((r) => r.id)).toEqual(["sample-rule"]);
  });
});

describe("rule schema details", () => {
  const base: RuleInput = {
    id: "x-rule",
    title: "A test rule",
    summary: "A test rule summary that is long enough.",
    applies_to: ["all"],
    forum: "insurer_gro",
    type: "duty",
    source_url: "https://irdai.gov.in/x",
    source_title: "Source title",
    source_reference: "para 1",
    issuing_body: "IRDAI",
    date_checked: "2026-11-06",
    status: "draft",
  };

  it("accepts a minimal valid rule", () => {
    expect(Rule.safeParse(base).success).toBe(true);
  });

  it("rejects unknown keys, 'all' mixed with codes, and deadline on non-time_limit rules", () => {
    expect(Rule.safeParse({ ...base, extra: 1 }).success).toBe(false);
    expect(Rule.safeParse({ ...base, applies_to: ["all", "waiting_period"] }).success).toBe(false);
    expect(
      Rule.safeParse({
        ...base,
        parameters: { w: { value: 1, unit: "days" } },
        deadline: { role: "filing_window", to: "insurer_gro", parameter: "w" },
      }).success,
    ).toBe(false);
  });

  it("rejects a deadline pointing at a missing or non-duration parameter", () => {
    const t = { ...base, type: "time_limit" as const };
    expect(
      Rule.safeParse({ ...t, deadline: { role: "filing_window", to: "insurer_gro", parameter: "nope" } }).success,
    ).toBe(false);
    expect(
      Rule.safeParse({
        ...t,
        parameters: { cap: { value: 5, unit: "paise" } },
        deadline: { role: "filing_window", to: "insurer_gro", parameter: "cap" },
      }).success,
    ).toBe(false);
  });

  it("official host check", () => {
    expect(isOfficialSourceUrl("https://bimabharosa.irdai.gov.in/Home/FAQ")).toBe(true);
    expect(isOfficialSourceUrl("https://www.cioins.co.in/a.pdf")).toBe(true);
    expect(isOfficialSourceUrl("http://irdai.gov.in/a")).toBe(false);
    expect(isOfficialSourceUrl("https://irdai.gov.in.evil.com/a")).toBe(false);
    expect(isOfficialSourceUrl("https://fakeirdai.gov.in/a")).toBe(false);
  });

  it("durationToDays rounds waits up and windows down", () => {
    expect(durationToDays({ value: 1, unit: "months" }, "wait")).toBe(31);
    expect(durationToDays({ value: 1, unit: "months" }, "window")).toBe(28);
    expect(durationToDays({ value: 1, unit: "years" }, "wait")).toBe(366);
    expect(durationToDays({ value: 1, unit: "years" }, "window")).toBe(365);
    expect(durationToDays({ value: 3, unit: "hours" }, "wait")).toBe(1);
    expect(durationToDays({ value: 3, unit: "hours" }, "window")).toBe(0);
    expect(() => durationToDays({ value: 2, unit: "percent" }, "wait")).toThrow();
  });

  it("two rules defining the same deadline is an error", () => {
    const rules = loadRules(fixture("valid"));
    const dup = { ...rules[0]!, id: "sample-rule-2" };
    expect(() => toDeadlineConfig([rules[0]!, dup], { forumOrder: ["insurance_ombudsman"], includeDrafts: true })).toThrow(
      RulesLoadError,
    );
  });
});
