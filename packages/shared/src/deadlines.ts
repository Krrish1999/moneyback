import { z } from "zod";
import { Forum } from "./case";
import { IsoDate } from "./records";

/**
 * Deadline engine (team/DECISIONS.md D-004). Pure functions, no I/O, no clock.
 *
 * Every legal number (waiting periods, filing windows, forum order) comes from the `config` the caller passes in,
 * which the caller builds from the rules library (packages/rules). Nothing legal is hard-coded here.
 *
 * All dates are calendar dates `YYYY-MM-DD`. Count them in India time: convert timestamps with `toIndiaDate()`.
 *
 * Model:
 * - The case is "at" `currentForum` (the forum where the complaint is pending), or `null` before the first
 *   complaint is filed.
 * - From `currentForum` the case can move to the next forum in `forumOrder` once the waiting period
 *   (`waitDaysBeforeEscalation` of the current forum, counted from `complaintSentAt`) has passed, or earlier on the
 *   forum's reply if that forum's rule says a reply allows early escalation (`escalateEarlyOnReply`).
 * - That earliest escalation date also starts the filing window of the next forum (`maxDaysToFile`; `null` means
 *   no limit). Before any complaint is filed, the window for the first forum starts at `claimDecisionAt`.
 */

export const ForumRule = z.object({
  /** Days after the complaint is sent to this forum before the case may escalate without a reply. */
  waitDaysBeforeEscalation: z.number().int().nonnegative(),
  /** Whether a reply from this forum lets the case escalate before the waiting period ends. */
  escalateEarlyOnReply: z.boolean(),
  /** Days allowed to file AT this forum, counted from the date the case could first move here. `null`: no limit. */
  maxDaysToFile: z.number().int().nonnegative().nullable(),
});
export type ForumRule = z.infer<typeof ForumRule>;

export const DeadlineConfig = z
  .object({
    forumOrder: z.array(Forum).min(1),
    forums: z.partialRecord(Forum, ForumRule),
  })
  .superRefine((cfg, ctx) => {
    if (new Set(cfg.forumOrder).size !== cfg.forumOrder.length) {
      ctx.addIssue({ code: "custom", path: ["forumOrder"], message: "forumOrder has duplicates" });
    }
    for (const forum of cfg.forumOrder) {
      if (!cfg.forums[forum]) {
        ctx.addIssue({ code: "custom", path: ["forums", forum], message: `no rule for forum ${forum}` });
      }
    }
  });
export type DeadlineConfig = z.infer<typeof DeadlineConfig>;

export const DeadlineInput = z
  .object({
    currentForum: Forum.nullable(),
    dates: z.object({
      /** Date of the insurer's claim rejection / part payment. Required when `currentForum` is null. */
      claimDecisionAt: IsoDate.optional(),
      /** Date the complaint was sent to `currentForum`. Required when `currentForum` is set. */
      complaintSentAt: IsoDate.optional(),
      /** Date `currentForum` replied (final reply / rejection), if it has. */
      replyAt: IsoDate.optional(),
    }),
    /** "Today" for the out-of-time check; the engine never reads the clock. */
    asOf: IsoDate,
    config: DeadlineConfig,
  })
  .superRefine((input, ctx) => {
    const { currentForum, dates, config } = input;
    if (currentForum === null) {
      if (!dates.claimDecisionAt) {
        ctx.addIssue({ code: "custom", path: ["dates", "claimDecisionAt"], message: "required before first filing" });
      }
      return;
    }
    if (!config.forumOrder.includes(currentForum)) {
      ctx.addIssue({ code: "custom", path: ["currentForum"], message: "currentForum is not in forumOrder" });
    }
    if (!dates.complaintSentAt) {
      ctx.addIssue({ code: "custom", path: ["dates", "complaintSentAt"], message: "required when currentForum is set" });
    } else if (dates.replyAt && dates.replyAt < dates.complaintSentAt) {
      ctx.addIssue({ code: "custom", path: ["dates", "replyAt"], message: "replyAt is before complaintSentAt" });
    }
  });
export type DeadlineInput = z.input<typeof DeadlineInput>;

export type DeadlineResult = {
  /** Where the case goes next; null when `currentForum` is the last forum in `forumOrder`. */
  nextForum: Forum | null;
  /** First date the case may be filed at `nextForum`. */
  earliestEscalationDate: string | null;
  /** Last date to file at `nextForum`; null when there is no next forum or it has no time limit. */
  lastFilingDate: string | null;
  /** `asOf` is after `lastFilingDate`. */
  outOfTime: boolean;
  /** `asOf` is within [earliestEscalationDate, lastFilingDate]. */
  canEscalateNow: boolean;
};

/** Adds whole days to a `YYYY-MM-DD` date. */
export function addDays(date: string, days: number): string {
  const ms = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Calendar date in India (Asia/Kolkata) of an ISO timestamp, as `YYYY-MM-DD`. */
export function toIndiaDate(isoDateTime: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(isoDateTime));
}

/** Validates the input (throws a ZodError if invalid) and computes the case's next forum and filing window. */
export function computeDeadlines(raw: DeadlineInput): DeadlineResult {
  const { currentForum, dates, asOf, config } = DeadlineInput.parse(raw);

  let nextForum: Forum | undefined;
  let earliest: string;
  if (currentForum === null) {
    nextForum = config.forumOrder[0];
    earliest = dates.claimDecisionAt!;
  } else {
    const rule = config.forums[currentForum]!;
    nextForum = config.forumOrder[config.forumOrder.indexOf(currentForum) + 1];
    const waitEnds = addDays(dates.complaintSentAt!, rule.waitDaysBeforeEscalation);
    const reply = dates.replyAt;
    earliest = reply !== undefined && rule.escalateEarlyOnReply && reply < waitEnds ? reply : waitEnds;
  }

  if (nextForum === undefined) {
    return {
      nextForum: null,
      earliestEscalationDate: null,
      lastFilingDate: null,
      outOfTime: false,
      canEscalateNow: false,
    };
  }

  const maxDays = config.forums[nextForum]!.maxDaysToFile;
  const lastFilingDate = maxDays === null ? null : addDays(earliest, maxDays);
  const outOfTime = lastFilingDate !== null && asOf > lastFilingDate;
  return {
    nextForum,
    earliestEscalationDate: earliest,
    lastFilingDate,
    outOfTime,
    canEscalateNow: !outOfTime && asOf >= earliest,
  };
}
