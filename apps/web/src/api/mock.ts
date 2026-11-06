import { CaseRecord, CaseStatus, CreateCaseInput } from "@moneyback/shared";
import { ApiError, type MoneyBackApi } from "./types";

/** Id of a sample case that is always present in the mock, so the timeline can be seen with a deadline. */
export const DEMO_CASE_ID = "demo";

type MockOptions = {
  /** Simulated network delay in ms. Default 0. */
  latencyMs?: number;
  now?: () => Date;
};

/**
 * In-memory implementation of MoneyBackApi with the same behaviour as apps/api `POST /cases` and
 * `GET /cases/:id`. Data is lost on page reload.
 */
export function createMockApi({ latencyMs = 0, now = () => new Date() }: MockOptions = {}): MoneyBackApi {
  const cases = new Map<string, CaseRecord>();
  cases.set(DEMO_CASE_ID, demoCase(now()));

  const delay = () => (latencyMs > 0 ? new Promise((r) => setTimeout(r, latencyMs)) : Promise.resolve());

  return {
    async createCase(body) {
      await delay();
      const parsed = CreateCaseInput.safeParse(body);
      if (!parsed.success) throw new ApiError(400, "invalid_input");
      const at = now().toISOString();
      const record = CaseRecord.parse({
        id: crypto.randomUUID(),
        userId: parsed.data.userId,
        category: parsed.data.category,
        insurer: parsed.data.insurer,
        claimAmountPaise: parsed.data.claimAmountPaise,
        status: CaseStatus.enum.intake,
        verdict: null,
        nextDeadline: null,
        amountRecoveredPaise: 0,
        createdAt: at,
        updatedAt: at,
      });
      cases.set(record.id, record);
      return structuredClone(record);
    },

    async getCase(id) {
      await delay();
      const found = cases.get(id);
      if (!found) throw new ApiError(404, "not_found");
      return structuredClone(found);
    },
  };
}

/** Sample data only. The deadline here is made up; real deadlines come from the deadline engine (D-004). */
function demoCase(now: Date): CaseRecord {
  const days = (d: number) => new Date(now.getTime() + d * 86_400_000).toISOString();
  return CaseRecord.parse({
    id: DEMO_CASE_ID,
    userId: "demo-user",
    category: "health_insurance",
    insurer: "Sample Health Insurance Co.",
    claimAmountPaise: 85_000_00,
    status: "waiting",
    verdict: "possible",
    nextDeadline: days(12).slice(0, 10),
    amountRecoveredPaise: 0,
    createdAt: days(-20),
    updatedAt: days(-18),
  });
}
