import type { CaseStatus } from "./case";

/**
 * Case lifecycle transition table (team/DECISIONS.md D-003).
 *
 *   intake → analysing → [review →] draft → sent → waiting → (escalated → waiting)* → won | lost
 *   any non-terminal state → closed
 *
 * `won`, `lost` and `closed` are terminal: nothing leaves them.
 * Every move not listed here is illegal.
 */
export const CASE_TRANSITIONS = {
  intake: ["analysing", "closed"],
  analysing: ["review", "draft", "closed"],
  review: ["draft", "closed"],
  draft: ["sent", "closed"],
  sent: ["waiting", "closed"],
  waiting: ["escalated", "won", "lost", "closed"],
  escalated: ["waiting", "closed"],
  won: [],
  lost: [],
  closed: [],
} as const satisfies Record<CaseStatus, readonly CaseStatus[]>;

export const TERMINAL_STATUSES: readonly CaseStatus[] = ["won", "lost", "closed"];

/** The states a case may move to from `from`. Empty for terminal states. */
export function allowedTransitions(from: CaseStatus): readonly CaseStatus[] {
  return CASE_TRANSITIONS[from];
}

export function isTerminal(status: CaseStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function canTransition(from: CaseStatus, to: CaseStatus): boolean {
  return (CASE_TRANSITIONS[from] as readonly CaseStatus[]).includes(to);
}

export class IllegalTransitionError extends Error {
  readonly from: CaseStatus;
  readonly to: CaseStatus;
  constructor(from: CaseStatus, to: CaseStatus) {
    super(`Illegal case transition: ${from} → ${to}`);
    this.name = "IllegalTransitionError";
    this.from = from;
    this.to = to;
  }
}

/** Returns `to` if the move is legal; throws `IllegalTransitionError` otherwise. */
export function transition(from: CaseStatus, to: CaseStatus): CaseStatus {
  if (!canTransition(from, to)) throw new IllegalTransitionError(from, to);
  return to;
}
