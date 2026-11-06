import { Hono } from "hono";
import type { Env } from "./env";
import { casesRoutes } from "./routes/cases";

export type { Env };

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.json({ ok: true, env: c.env.APP_ENV }));
app.route("/cases", casesRoutes);

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "internal_error" }, 500);
});

export default app;
