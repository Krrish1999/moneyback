import { z } from "zod";
import { Forum } from "@moneyback/shared";
import { RejectionReasonCode } from "@moneyback/prompts";

/**
 * Rules library schema (W1-05). One rule = one YAML file in packages/rules/rules/<id>.yaml.
 * Agents add rules only as `status: draft` (team/DECISIONS.md D-005); only Kunal or a reviewing advocate sets `verified`.
 */

/** Hosts we accept as official/primary sources. Anything else fails validation. */
export const OFFICIAL_SOURCE_HOSTS = [
  "irdai.gov.in",
  "bimabharosa.irdai.gov.in",
  "policyholder.gov.in",
  "cioins.co.in",
  "egazette.gov.in",
  "egazette.nic.in",
  "financialservices.gov.in",
  "consumeraffairs.nic.in",
] as const;

export function isOfficialSourceUrl(url: string): boolean {
  let host: string;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    host = u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return false;
  }
  return OFFICIAL_SOURCE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

export const RuleType = z.enum(["duty", "time_limit", "eligibility", "right"]);
export type RuleType = z.infer<typeof RuleType>;

export const RuleStatus = z.enum(["draft", "verified"]);
export type RuleStatus = z.infer<typeof RuleStatus>;

/** Units are kept as the source states them ("one month" stays 1 month); code converts, never the model. */
export const ParameterUnit = z.enum(["hours", "days", "months", "years", "paise", "percent"]);
export type ParameterUnit = z.infer<typeof ParameterUnit>;

export const RuleParameter = z.strictObject({
  value: z.number().nonnegative(),
  unit: ParameterUnit,
  /** Optional note on what the number is counted from, as the source words it. */
  counted_from: z.string().min(1).optional(),
});
export type RuleParameter = z.infer<typeof RuleParameter>;

/** "all" = applies whatever the rejection reason (process rules). */
export const AppliesTo = z.array(z.union([z.literal("all"), RejectionReasonCode])).min(1);

/** Rule forum: the forum the rule governs, or "any" for rules about the claim itself. */
export const RuleForum = z.union([Forum, z.literal("any")]);

/**
 * Marks a time_limit rule as an input to the deadline engine.
 * - wait_before_escalation: how long the case must wait at `from` (after the complaint is sent) before it may move to `to`.
 * - filing_window: how long after the case could first move to `to` it may still be filed there.
 */
export const DeadlineLink = z.discriminatedUnion("role", [
  z.strictObject({
    role: z.literal("wait_before_escalation"),
    from: Forum,
    to: Forum,
    parameter: z.string().min(1),
    /** A final reply / rejection from `from` lets the case escalate before the wait ends. */
    escalate_early_on_reply: z.boolean(),
  }),
  z.strictObject({
    role: z.literal("filing_window"),
    to: Forum,
    parameter: z.string().min(1),
  }),
]);
export type DeadlineLink = z.infer<typeof DeadlineLink>;

const IsoDate = z.iso.date();

export const Rule = z
  .strictObject({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "id must be kebab-case"),
    title: z.string().min(5),
    /** Plain-English summary a user can read. No legal advice wording. */
    summary: z.string().min(20),
    applies_to: AppliesTo,
    forum: RuleForum,
    type: RuleType,
    parameters: z.record(z.string().regex(/^[a-z][a-z0-9_]*$/), RuleParameter).default({}),
    deadline: DeadlineLink.optional(),
    source_url: z.url().refine(isOfficialSourceUrl, "source_url must be an https URL on an official host"),
    source_title: z.string().min(5),
    /** Where in the source: rule/paragraph number and heading. */
    source_reference: z.string().min(1),
    issuing_body: z.string().min(2),
    date_checked: IsoDate,
    status: RuleStatus,
    /** Reviewer notes: caveats, conflicts between sources, what to check before verifying. */
    notes: z.string().optional(),
  })
  .superRefine((rule, ctx) => {
    if (rule.applies_to.includes("all") && rule.applies_to.length > 1) {
      ctx.addIssue({ code: "custom", path: ["applies_to"], message: '"all" cannot be combined with reason codes' });
    }
    if (new Set(rule.applies_to).size !== rule.applies_to.length) {
      ctx.addIssue({ code: "custom", path: ["applies_to"], message: "duplicate reason codes" });
    }
    if (rule.deadline) {
      if (rule.type !== "time_limit") {
        ctx.addIssue({ code: "custom", path: ["deadline"], message: "only time_limit rules may feed the deadline engine" });
      }
      const p = rule.parameters[rule.deadline.parameter];
      if (!p) {
        ctx.addIssue({ code: "custom", path: ["deadline", "parameter"], message: `no parameter "${rule.deadline.parameter}"` });
      } else if (!["hours", "days", "months", "years"].includes(p.unit)) {
        ctx.addIssue({ code: "custom", path: ["deadline", "parameter"], message: "deadline parameter must be a duration" });
      }
      if (rule.deadline.role === "wait_before_escalation" && rule.deadline.from === rule.deadline.to) {
        ctx.addIssue({ code: "custom", path: ["deadline"], message: "from and to must differ" });
      }
    }
  });
export type Rule = z.infer<typeof Rule>;
export type RuleInput = z.input<typeof Rule>;
