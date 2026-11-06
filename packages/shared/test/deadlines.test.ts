import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { type DeadlineConfig, type DeadlineInput, addDays, computeDeadlines, toIndiaDate } from "../src";

// Made-up numbers on purpose: the engine must not know any real legal values.
const config: DeadlineConfig = {
  forumOrder: ["insurer_gro", "bima_bharosa", "insurance_ombudsman"],
  forums: {
    insurer_gro: { waitDaysBeforeEscalation: 10, escalateEarlyOnReply: true, maxDaysToFile: 40 },
    bima_bharosa: { waitDaysBeforeEscalation: 7, escalateEarlyOnReply: false, maxDaysToFile: 20 },
    insurance_ombudsman: { waitDaysBeforeEscalation: 3, escalateEarlyOnReply: true, maxDaysToFile: null },
  },
};

type Row = {
  name: string;
  input: Omit<DeadlineInput, "config"> & { config?: DeadlineConfig };
  expected: ReturnType<typeof computeDeadlines>;
};

const rows: Row[] = [
  {
    name: "before first filing: next is first forum, window from claim decision",
    input: { currentForum: null, dates: { claimDecisionAt: "2026-01-01" }, asOf: "2026-01-05" },
    expected: {
      nextForum: "insurer_gro",
      earliestEscalationDate: "2026-01-01",
      lastFilingDate: "2026-02-10",
      outOfTime: false,
      canEscalateNow: true,
    },
  },
  {
    name: "before first filing: out of time after window",
    input: { currentForum: null, dates: { claimDecisionAt: "2026-01-01" }, asOf: "2026-02-11" },
    expected: {
      nextForum: "insurer_gro",
      earliestEscalationDate: "2026-01-01",
      lastFilingDate: "2026-02-10",
      outOfTime: true,
      canEscalateNow: false,
    },
  },
  {
    name: "at insurer, no reply, still waiting",
    input: { currentForum: "insurer_gro", dates: { complaintSentAt: "2026-03-01" }, asOf: "2026-03-05" },
    expected: {
      nextForum: "bima_bharosa",
      earliestEscalationDate: "2026-03-11",
      lastFilingDate: "2026-03-31",
      outOfTime: false,
      canEscalateNow: false,
    },
  },
  {
    name: "at insurer, no reply, wait over: last filing day is still in time",
    input: { currentForum: "insurer_gro", dates: { complaintSentAt: "2026-03-01" }, asOf: "2026-03-31" },
    expected: {
      nextForum: "bima_bharosa",
      earliestEscalationDate: "2026-03-11",
      lastFilingDate: "2026-03-31",
      outOfTime: false,
      canEscalateNow: true,
    },
  },
  {
    name: "at insurer, early reply allows early escalation",
    input: {
      currentForum: "insurer_gro",
      dates: { complaintSentAt: "2026-03-01", replyAt: "2026-03-04" },
      asOf: "2026-03-04",
    },
    expected: {
      nextForum: "bima_bharosa",
      earliestEscalationDate: "2026-03-04",
      lastFilingDate: "2026-03-24",
      outOfTime: false,
      canEscalateNow: true,
    },
  },
  {
    name: "at insurer, reply after wait ends: window counts from wait end",
    input: {
      currentForum: "insurer_gro",
      dates: { complaintSentAt: "2026-03-01", replyAt: "2026-03-20" },
      asOf: "2026-04-01",
    },
    expected: {
      nextForum: "bima_bharosa",
      earliestEscalationDate: "2026-03-11",
      lastFilingDate: "2026-03-31",
      outOfTime: true,
      canEscalateNow: false,
    },
  },
  {
    name: "forum that ignores early replies waits the full period",
    input: {
      currentForum: "bima_bharosa",
      dates: { complaintSentAt: "2026-05-01", replyAt: "2026-05-02" },
      asOf: "2026-05-03",
    },
    expected: {
      nextForum: "insurance_ombudsman",
      earliestEscalationDate: "2026-05-08",
      lastFilingDate: null,
      outOfTime: false,
      canEscalateNow: false,
    },
  },
  {
    name: "next forum with no time limit is never out of time",
    input: { currentForum: "bima_bharosa", dates: { complaintSentAt: "2026-05-01" }, asOf: "2030-01-01" },
    expected: {
      nextForum: "insurance_ombudsman",
      earliestEscalationDate: "2026-05-08",
      lastFilingDate: null,
      outOfTime: false,
      canEscalateNow: true,
    },
  },
  {
    name: "last forum: nowhere to go",
    input: { currentForum: "insurance_ombudsman", dates: { complaintSentAt: "2026-06-01" }, asOf: "2026-07-01" },
    expected: {
      nextForum: null,
      earliestEscalationDate: null,
      lastFilingDate: null,
      outOfTime: false,
      canEscalateNow: false,
    },
  },
  {
    name: "caller-defined order skips a forum",
    input: {
      currentForum: "insurer_gro",
      dates: { complaintSentAt: "2026-03-01" },
      asOf: "2026-03-01",
      config: { ...config, forumOrder: ["insurer_gro", "insurance_ombudsman"] },
    },
    expected: {
      nextForum: "insurance_ombudsman",
      earliestEscalationDate: "2026-03-11",
      lastFilingDate: null,
      outOfTime: false,
      canEscalateNow: false,
    },
  },
  {
    name: "zero-day wait and window crossing a leap day",
    input: {
      currentForum: "insurer_gro",
      dates: { complaintSentAt: "2028-02-28" },
      asOf: "2028-02-29",
      config: {
        forumOrder: ["insurer_gro", "bima_bharosa"],
        forums: {
          insurer_gro: { waitDaysBeforeEscalation: 0, escalateEarlyOnReply: false, maxDaysToFile: 1 },
          bima_bharosa: { waitDaysBeforeEscalation: 0, escalateEarlyOnReply: false, maxDaysToFile: 1 },
        },
      },
    },
    expected: {
      nextForum: "bima_bharosa",
      earliestEscalationDate: "2028-02-28",
      lastFilingDate: "2028-02-29",
      outOfTime: false,
      canEscalateNow: true,
    },
  },
];

describe("computeDeadlines", () => {
  it.each(rows)("$name", ({ input, expected }) => {
    expect(computeDeadlines({ config, ...input })).toEqual(expected);
  });
});

describe("computeDeadlines rejects invalid input", () => {
  const bad: Array<[string, DeadlineInput]> = [
    ["no claim decision date before first filing", { currentForum: null, dates: {}, asOf: "2026-01-01", config }],
    ["no complaint sent date at a forum", { currentForum: "insurer_gro", dates: {}, asOf: "2026-01-01", config }],
    [
      "reply before complaint",
      {
        currentForum: "insurer_gro",
        dates: { complaintSentAt: "2026-01-10", replyAt: "2026-01-09" },
        asOf: "2026-01-11",
        config,
      },
    ],
    [
      "current forum not in order",
      {
        currentForum: "bima_bharosa",
        dates: { complaintSentAt: "2026-01-10" },
        asOf: "2026-01-11",
        config: { ...config, forumOrder: ["insurer_gro", "insurance_ombudsman"] },
      },
    ],
    [
      "forum in order without a rule",
      {
        currentForum: null,
        dates: { claimDecisionAt: "2026-01-01" },
        asOf: "2026-01-01",
        config: { forumOrder: ["insurer_gro", "bima_bharosa"], forums: { insurer_gro: config.forums.insurer_gro } },
      },
    ],
    [
      "duplicate forum in order",
      {
        currentForum: null,
        dates: { claimDecisionAt: "2026-01-01" },
        asOf: "2026-01-01",
        config: { ...config, forumOrder: ["insurer_gro", "insurer_gro"] },
      },
    ],
    ["empty order", { currentForum: null, dates: { claimDecisionAt: "2026-01-01" }, asOf: "2026-01-01", config: { forumOrder: [], forums: {} } }],
    ["datetime instead of date", { currentForum: null, dates: { claimDecisionAt: "2026-01-01T00:00:00Z" }, asOf: "2026-01-01", config }],
    [
      "negative wait",
      {
        currentForum: null,
        dates: { claimDecisionAt: "2026-01-01" },
        asOf: "2026-01-01",
        config: { forumOrder: ["insurer_gro"], forums: { insurer_gro: { waitDaysBeforeEscalation: -1, escalateEarlyOnReply: true, maxDaysToFile: 1 } } },
      },
    ],
  ];
  it.each(bad)("%s", (_name, input) => {
    expect(() => computeDeadlines(input)).toThrow(ZodError);
  });
});

describe("date helpers", () => {
  it.each([
    ["2026-01-31", 1, "2026-02-01"],
    ["2026-12-31", 1, "2027-01-01"],
    ["2026-03-01", -1, "2026-02-28"],
    ["2026-01-01", 0, "2026-01-01"],
    ["2026-01-01", 365, "2027-01-01"],
  ] as const)("addDays(%s, %i) = %s", (d, n, out) => {
    expect(addDays(d, n)).toBe(out);
  });

  it.each([
    ["2026-11-06T18:29:59Z", "2026-11-06"],
    ["2026-11-06T18:30:00Z", "2026-11-07"],
    ["2026-11-06T00:00:00Z", "2026-11-06"],
  ])("toIndiaDate(%s) = %s", (ts, out) => {
    expect(toIndiaDate(ts)).toBe(out);
  });
});
