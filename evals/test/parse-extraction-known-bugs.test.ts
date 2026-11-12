/**
 * Known bugs in @moneyback/prompts parseExtraction (owner: ai-engineer), filed in team/handoffs/qa-engineer.md
 * on 2026-11-06. `it.fails` passes while the bug exists; when the AI engineer fixes it, these start failing:
 * then change `it.fails` to `it`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseExtraction } from "@moneyback/prompts";
import { GOLDEN_DIR } from "../runner/golden";

const good = readFileSync(path.join(GOLDEN_DIR, "case-01-ped-reimbursement", "recorded-output.json"), "utf8");

describe("parseExtraction known bugs (ai-engineer)", () => {
  it("control: bare and fenced JSON parse", () => {
    expect(parseExtraction(good).ok).toBe(true);
    expect(parseExtraction("```json\n" + good + "\n```").ok).toBe(true);
  });

  it("BUG-QA-1 (fixed 2026-11-12): prose containing a brace before the JSON is rejected (takes the first '{')", () => {
    expect(parseExtraction("Facts from {doc_1} and {doc_2} below:\n" + good).ok).toBe(true);
  });

  it("BUG-QA-2 (fixed 2026-11-12): only the first ``` fence is considered, even when a later ```json fence holds the answer", () => {
    expect(parseExtraction("Format:\n```\n{}\n```\nAnswer:\n```json\n" + good + "\n```").ok).toBe(true);
  });
});
