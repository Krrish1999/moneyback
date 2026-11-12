import { Hono } from "hono";
import { deleteCookie } from "hono/cookie";
import { eq, inArray, isNotNull, and } from "drizzle-orm";
import { AcceptConsentInput, CONSENT_VERSION } from "@moneyback/shared";
import type { AppEnv } from "../env";
import { getDb, schema } from "../db/client";
import { requireSession, SESSION_COOKIE } from "../auth/session";
import { deleteUserFiles } from "../storage";

export const accountRoutes = new Hono<AppEnv>();

accountRoutes.use("*", requireSession);

/**
 * Record that the signed-in user agrees to the consent text. Body: { version }.
 * The version must be the current one, so nobody can agree to text they were not shown.
 * Agreeing twice is harmless: the first time stamp is kept.
 */
accountRoutes.post("/consent", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = AcceptConsentInput.safeParse(body);
  if (!parsed.success) return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  if (parsed.data.version !== CONSENT_VERSION) return c.json({ error: "consent_version_outdated" }, 409);

  const userId = c.get("userId");
  const db = getDb(c.env.DB);
  await db
    .insert(schema.consents)
    .values({ userId, version: CONSENT_VERSION, acceptedAt: new Date().toISOString() })
    .onConflictDoNothing();
  const row = await db.query.consents.findFirst({
    where: and(eq(schema.consents.userId, userId), eq(schema.consents.version, CONSENT_VERSION)),
  });
  if (!row) return c.json({ error: "internal_error" }, 500);
  return c.json({ version: row.version, acceptedAt: row.acceptedAt });
});

/**
 * Delete my data: removes the signed-in user, every case, document, letter, event and payment row
 * that belongs to them, all their sessions, and all their files in R2. Cannot be undone.
 *
 * Order matters. Files go first: if R2 fails, the request fails with the rows still in place, so the
 * user can try again and nothing is orphaned. The rows then go in one D1 batch (a single transaction).
 */
accountRoutes.delete("/", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env.DB);
  const userCases = db.select({ id: schema.cases.id }).from(schema.cases).where(eq(schema.cases.userId, userId));

  const [docs, pdfs] = await Promise.all([
    db.select({ key: schema.documents.r2Key }).from(schema.documents).where(inArray(schema.documents.caseId, userCases)),
    db
      .select({ key: schema.letters.pdfR2Key })
      .from(schema.letters)
      .where(and(inArray(schema.letters.caseId, userCases), isNotNull(schema.letters.pdfR2Key))),
  ]);
  const keys = [...docs, ...pdfs].map((row) => row.key).filter((key): key is string => key !== null);
  await deleteUserFiles(c.env.DOCS, userId, keys);

  await db.batch([
    db.delete(schema.events).where(inArray(schema.events.caseId, userCases)),
    db.delete(schema.payments).where(inArray(schema.payments.caseId, userCases)),
    db.delete(schema.letters).where(inArray(schema.letters.caseId, userCases)),
    db.delete(schema.documents).where(inArray(schema.documents.caseId, userCases)),
    db.delete(schema.cases).where(eq(schema.cases.userId, userId)),
    db.delete(schema.sessions).where(eq(schema.sessions.userId, userId)),
    db.delete(schema.consents).where(eq(schema.consents.userId, userId)),
    db.delete(schema.rateLimits).where(inArray(schema.rateLimits.key, [`cases:user:${userId}`, `upload:user:${userId}`])),
    db.delete(schema.users).where(eq(schema.users.id, userId)),
  ]);

  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: true });
  // Log that a deletion happened, never who or what.
  console.log("account_deleted");
  return c.json({ ok: true });
});
