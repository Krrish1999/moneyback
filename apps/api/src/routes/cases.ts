import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { CaseRecord, CreateCaseInput, Id } from "@moneyback/shared";
import type { AppEnv } from "../env";
import { getDb, schema } from "../db/client";
import { requireSession } from "../auth/session";
import { allow, ipKey, LIMITS, tooManyRequests } from "../rate-limit";

export const casesRoutes = new Hono<AppEnv>();

// Every case route needs a signed-in user. The owner always comes from the session, never from the request.
casesRoutes.use("*", requireSession);

/** Create a case in `intake` status for the signed-in user. Body: CreateCaseInput. Returns 201 + CaseRecord. */
casesRoutes.post("/", async (c) => {
  const userId = c.get("userId");

  if (!(await allow(c.env.DB, `cases:user:${userId}`, LIMITS.createCasePerUser))) {
    return tooManyRequests(c, LIMITS.createCasePerUser);
  }
  const key = await ipKey(c, "cases");
  if (key && !(await allow(c.env.DB, key, LIMITS.createCasePerIp))) return tooManyRequests(c, LIMITS.createCasePerIp);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = CreateCaseInput.safeParse(body);
  if (!parsed.success) return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  const input = parsed.data;

  const now = new Date().toISOString();
  const record: CaseRecord = {
    id: crypto.randomUUID(),
    userId,
    category: input.category,
    insurer: input.insurer,
    claimAmountPaise: input.claimAmountPaise,
    status: "intake",
    verdict: null,
    nextDeadline: null,
    amountRecoveredPaise: 0,
    createdAt: now,
    updatedAt: now,
  };

  const db = getDb(c.env.DB);
  await db.batch([
    db.insert(schema.cases).values(record),
    db.insert(schema.events).values({
      id: crypto.randomUUID(),
      caseId: record.id,
      type: "case_created",
      actor: "user",
      data: { status: record.status },
      createdAt: now,
    }),
  ]);

  return c.json(record, 201);
});

/** Fetch one of the signed-in user's cases. Someone else's case is a 404, so ids are not confirmed to strangers. */
casesRoutes.get("/:id", async (c) => {
  const id = Id.safeParse(c.req.param("id"));
  if (!id.success) return c.json({ error: "invalid_input", issues: id.error.issues }, 400);

  const row = await getDb(c.env.DB).query.cases.findFirst({
    where: and(eq(schema.cases.id, id.data), eq(schema.cases.userId, c.get("userId"))),
  });
  if (!row) return c.json({ error: "not_found" }, 404);

  return c.json(CaseRecord.parse(row));
});
