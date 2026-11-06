import { parse as parseYaml, YAMLParseError } from "yaml";
import { DeadlineConfig, type Forum, type ForumRule } from "@moneyback/shared";
import type { RejectionReasonCode } from "@moneyback/prompts";
import { Rule, type RuleParameter, type RuleStatus } from "./schema";

/** A rule file's contents, independent of where it came from (disk, bundle, test). */
export type RuleSource = { path: string; text: string };

export class RulesLoadError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Rules library is invalid (${problems.length} problem(s)):\n- ${problems.join("\n- ")}`);
    this.name = "RulesLoadError";
  }
}

/**
 * Parse and validate rule files. Pure (no I/O), so it also runs in Workers on bundled text.
 * Collects every problem and throws one RulesLoadError listing them all: malformed YAML, schema errors,
 * file name not matching id, duplicate ids.
 */
export function parseRules(sources: RuleSource[]): Rule[] {
  const problems: string[] = [];
  const rules: Rule[] = [];
  const seen = new Map<string, string>();
  for (const { path, text } of sources) {
    let raw: unknown;
    try {
      raw = parseYaml(text, { uniqueKeys: true });
    } catch (e) {
      problems.push(`${path}: YAML ${e instanceof YAMLParseError ? e.message.split("\n")[0] : String(e)}`);
      continue;
    }
    const result = Rule.safeParse(raw);
    if (!result.success) {
      for (const issue of result.error.issues) {
        problems.push(`${path}: ${issue.path.join(".") || "(root)"}: ${issue.message}`);
      }
      continue;
    }
    const rule = result.data;
    const base = path.split(/[\\/]/).pop()!.replace(/\.ya?ml$/, "");
    if (base !== rule.id) problems.push(`${path}: file name must be "${rule.id}.yaml"`);
    const prior = seen.get(rule.id);
    if (prior) {
      problems.push(`${path}: duplicate rule id "${rule.id}" (also in ${prior})`);
      continue;
    }
    seen.set(rule.id, path);
    rules.push(rule);
  }
  if (problems.length > 0) throw new RulesLoadError(problems);
  return rules.sort((a, b) => a.id.localeCompare(b.id));
}

export type FindRulesQuery = {
  reasonCode?: RejectionReasonCode;
  forum?: Forum;
  /** Default: both statuses. Production drafting must pass ["verified"] (D-005). */
  statuses?: RuleStatus[];
};

/**
 * Rules relevant to a reason code and/or forum. A rule with `applies_to: [all]` matches any reason code;
 * a rule with `forum: any` matches any forum.
 */
export function findRules(rules: readonly Rule[], query: FindRulesQuery): Rule[] {
  const { reasonCode, forum, statuses } = query;
  return rules.filter(
    (r) =>
      (reasonCode === undefined ||
        r.applies_to.includes("all") ||
        (r.applies_to as readonly string[]).includes(reasonCode)) &&
      (forum === undefined || r.forum === "any" || r.forum === forum) &&
      (statuses === undefined || statuses.includes(r.status)),
  );
}

/**
 * Durations in rules keep the source's unit ("one month", "one year"). The deadline engine works in whole days,
 * so we convert conservatively, never in the user's disfavour:
 * - a waiting period is rounded UP (month = 31 days, year = 366 days) so we never escalate too early;
 * - a filing window is rounded DOWN (month = 28 days, year = 365 days) so we never tell a user they are in time
 *   when they are not.
 * Hours round up to whole days for waits and down for windows.
 */
export function durationToDays(p: RuleParameter, mode: "wait" | "window"): number {
  const up = mode === "wait";
  switch (p.unit) {
    case "days":
      return up ? Math.ceil(p.value) : Math.floor(p.value);
    case "hours":
      return up ? Math.ceil(p.value / 24) : Math.floor(p.value / 24);
    case "months":
      return Math.round(p.value * (up ? 31 : 28));
    case "years":
      return Math.round(p.value * (up ? 366 : 365));
    default:
      throw new Error(`unit ${p.unit} is not a duration`);
  }
}

export type DeadlineGap = {
  forum: Forum;
  field: keyof ForumRule;
  message: string;
};

export type ToDeadlineConfigResult = {
  /** Null when a required number is missing from the (selected) rules; see `gaps`. */
  config: DeadlineConfig | null;
  /** Missing or defaulted values. A non-empty list needs a human decision before production use. */
  gaps: DeadlineGap[];
  /** Rule ids each value came from, for audit and display. */
  sources: Partial<Record<Forum, { wait?: string; window?: string }>>;
};

/**
 * Build the deadline engine's config (`DeadlineConfig` from @moneyback/shared) from the rules library.
 * By default only `verified` rules are used (D-005); pass `includeDrafts: true` for development and tests.
 *
 * - `waitDaysBeforeEscalation` / `escalateEarlyOnReply` of forum F come from the rule with
 *   `deadline: { role: wait_before_escalation, from: F, to: <next forum in forumOrder> }`. Missing for a non-final
 *   forum -> a gap and `config: null` (we never invent a wait).
 * - `maxDaysToFile` of forum F comes from the rule with `deadline: { role: filing_window, to: F }`. Missing -> `null`
 *   (engine treats as no limit) AND a gap, because "no rule found" is not the same as "no limit".
 * - The last forum's wait is unused by the engine; it is set to 0 without a gap.
 */
export function toDeadlineConfig(
  rules: readonly Rule[],
  options: { forumOrder: Forum[]; includeDrafts?: boolean },
): ToDeadlineConfigResult {
  const { forumOrder, includeDrafts = false } = options;
  const usable = rules.filter((r) => r.deadline && (includeDrafts || r.status === "verified"));
  const gaps: DeadlineGap[] = [];
  const sources: ToDeadlineConfigResult["sources"] = {};
  const forums: Partial<Record<Forum, ForumRule>> = {};
  let complete = true;

  const pick = (matches: Rule[], what: string): Rule | undefined => {
    if (matches.length > 1) {
      throw new RulesLoadError([`more than one rule defines ${what}: ${matches.map((r) => r.id).join(", ")}`]);
    }
    return matches[0];
  };

  forumOrder.forEach((forum, i) => {
    const next = forumOrder[i + 1];
    let waitDaysBeforeEscalation = 0;
    let escalateEarlyOnReply = false;
    if (next !== undefined) {
      const waitRule = pick(
        usable.filter(
          (r) => r.deadline?.role === "wait_before_escalation" && r.deadline.from === forum && r.deadline.to === next,
        ),
        `the wait from ${forum} to ${next}`,
      );
      if (waitRule?.deadline?.role === "wait_before_escalation") {
        waitDaysBeforeEscalation = durationToDays(waitRule.parameters[waitRule.deadline.parameter]!, "wait");
        escalateEarlyOnReply = waitRule.deadline.escalate_early_on_reply;
        (sources[forum] ??= {}).wait = waitRule.id;
      } else {
        complete = false;
        gaps.push({
          forum,
          field: "waitDaysBeforeEscalation",
          message: `no ${includeDrafts ? "" : "verified "}rule gives the wait at ${forum} before escalating to ${next}`,
        });
      }
    }
    const windowRule = pick(
      usable.filter((r) => r.deadline?.role === "filing_window" && r.deadline.to === forum),
      `the filing window for ${forum}`,
    );
    let maxDaysToFile: number | null = null;
    if (windowRule) {
      maxDaysToFile = durationToDays(windowRule.parameters[windowRule.deadline!.parameter]!, "window");
      (sources[forum] ??= {}).window = windowRule.id;
    } else {
      gaps.push({
        forum,
        field: "maxDaysToFile",
        message: `no ${includeDrafts ? "" : "verified "}rule gives a filing time limit for ${forum}; set to null (no limit)`,
      });
    }
    forums[forum] = { waitDaysBeforeEscalation, escalateEarlyOnReply, maxDaysToFile };
  });

  return {
    config: complete ? DeadlineConfig.parse({ forumOrder, forums }) : null,
    gaps,
    sources,
  };
}
