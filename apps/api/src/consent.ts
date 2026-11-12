import type { MiddlewareHandler } from "hono";
import { and, eq } from "drizzle-orm";
import { CONSENT_VERSION } from "@moneyback/shared";
import type { AppEnv } from "./env";
import { getDb, schema } from "./db/client";

/** The current consent version if this user has agreed to it, otherwise null. */
export async function currentConsentVersion(d1: D1Database, userId: string): Promise<string | null> {
  const row = await getDb(d1).query.consents.findFirst({
    where: and(eq(schema.consents.userId, userId), eq(schema.consents.version, CONSENT_VERSION)),
  });
  return row ? row.version : null;
}

/**
 * Rejects with 403 `consent_required` unless the signed-in user has agreed to the current consent text.
 * Use after `requireSession` on every route that takes in documents or other personal data (S2-08 uploads).
 */
export const requireConsent: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!(await currentConsentVersion(c.env.DB, c.get("userId")))) return c.json({ error: "consent_required" }, 403);
  await next();
};
