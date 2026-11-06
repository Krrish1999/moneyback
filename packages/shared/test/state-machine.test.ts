import { describe, expect, it } from "vitest";
import {
  CASE_TRANSITIONS,
  CaseStatus,
  IllegalTransitionError,
  allowedTransitions,
  canTransition,
  isTerminal,
  transition,
} from "../src";

const ALL = CaseStatus.options;

// The full expected table, written out independently of CASE_TRANSITIONS (D-003).
const LEGAL: Array<[CaseStatus, CaseStatus]> = [
  ["intake", "analysing"],
  ["intake", "closed"],
  ["analysing", "review"],
  ["analysing", "draft"],
  ["analysing", "closed"],
  ["review", "draft"],
  ["review", "closed"],
  ["draft", "sent"],
  ["draft", "closed"],
  ["sent", "waiting"],
  ["sent", "closed"],
  ["waiting", "escalated"],
  ["waiting", "won"],
  ["waiting", "lost"],
  ["waiting", "closed"],
  ["escalated", "waiting"],
  ["escalated", "closed"],
];
const isLegal = (from: CaseStatus, to: CaseStatus) => LEGAL.some(([f, t]) => f === from && t === to);
const ALL_PAIRS = ALL.flatMap((from) => ALL.map((to) => [from, to] as [CaseStatus, CaseStatus]));
const ILLEGAL = ALL_PAIRS.filter(([f, t]) => !isLegal(f, t));

describe("case state machine", () => {
  it("covers every status in the table", () => {
    expect(Object.keys(CASE_TRANSITIONS).sort()).toEqual([...ALL].sort());
  });

  it.each(LEGAL)("allows %s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(transition(from, to)).toBe(to);
  });

  it.each(ILLEGAL)("rejects %s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    expect(() => transition(from, to)).toThrow(IllegalTransitionError);
  });

  it("checks all 100 pairs", () => {
    expect(LEGAL.length + ILLEGAL.length).toBe(ALL.length * ALL.length);
  });

  it.each([
    ["won", true],
    ["lost", true],
    ["closed", true],
    ["intake", false],
    ["waiting", false],
    ["escalated", false],
  ] as const)("isTerminal(%s) = %s", (status, terminal) => {
    expect(isTerminal(status)).toBe(terminal);
    expect(allowedTransitions(status).length === 0).toBe(terminal);
  });

  it("every non-terminal state can be closed", () => {
    for (const s of ALL.filter((s) => !isTerminal(s))) expect(canTransition(s, "closed")).toBe(true);
  });

  it("error carries from/to", () => {
    try {
      transition("intake", "won");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(IllegalTransitionError);
      expect(e).toMatchObject({ from: "intake", to: "won", name: "IllegalTransitionError" });
      expect((e as Error).message).toContain("intake → won");
    }
  });
});
