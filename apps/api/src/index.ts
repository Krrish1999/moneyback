import { Hono } from "hono";

export type Env = {
  DB: D1Database;
  DOCS: R2Bucket;
  APP_ENV: string;
};

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.json({ ok: true, env: c.env.APP_ENV }));

export default app;
