import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { CaseRecord, CreateCaseInput, Id } from "@moneyback/shared";
import type { Env } from "../env";
import { getDb, schema } from "../db/client";

export const casesRoutes = new Hono<{ Bindings: Env }>();

/** Create a case in `intake` status. Body: CreateCaseInput. Returns 201 + CaseRecord. */
casesRoutes.post("/", async (c) => {
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
    // TODO(B-01, week 2): take the user id from the authenticated session, not the request body,
    // and drop the placeholder-user insert below. Until then anyone can create a case for any user id.
    userId: input.userId,
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
    // TODO(B-01): placeholder user row so the cases.user_id foreign key holds before sign-up exists.
    db.insert(schema.users).values({ id: input.userId, createdAt: now, updatedAt: now }).onConflictDoNothing(),
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

/** Fetch one case. Returns 200 + CaseRecord, or 404. */
casesRoutes.get("/:id", async (c) => {
  const id = Id.safeParse(c.req.param("id"));
  if (!id.success) return c.json({ error: "invalid_input", issues: id.error.issues }, 400);

  // TODO(B-01): also require cases.user_id = session user (return 404, not 403, to avoid leaking ids).
  const row = await getDb(c.env.DB).query.cases.findFirst({ where: eq(schema.cases.id, id.data) });
  if (!row) return c.json({ error: "not_found" }, 404);

  return c.json(CaseRecord.parse(row));
});
