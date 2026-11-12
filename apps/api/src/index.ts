import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { allowedOrigins, type AppEnv, type Env } from "./env";
import { accountRoutes } from "./routes/account";
import { authRoutes } from "./routes/auth";
import { casesRoutes } from "./routes/cases";
import { documentsRoutes } from "./routes/documents";
import { MAX_UPLOAD_BYTES } from "@moneyback/shared";

export type { Env };

const app = new Hono<AppEnv>();

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Responses can hold health and claim data: never let a browser or proxy cache them.
app.use("*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
});

// Only the web app's own origins may call the API with cookies.
app.use("*", (c, next) =>
  cors({
    origin: (origin) => (allowedOrigins(c.env).includes(origin) ? origin : null),
    credentials: true,
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["content-type", "x-file-name"],
    maxAge: 600,
  })(c, next),
);

// Cross-site request forgery guard: a browser always sends Origin on these methods, and it must be ours.
app.use("*", async (c, next) => {
  const origin = c.req.header("origin");
  if (UNSAFE_METHODS.has(c.req.method) && origin && !allowedOrigins(c.env).includes(origin)) {
    return c.json({ error: "forbidden_origin" }, 403);
  }
  await next();
});

// JSON bodies are small. Only the document upload route may carry a file.
const jsonBodyLimit = bodyLimit({ maxSize: 16 * 1024, onError: (c) => c.json({ error: "body_too_large" }, 413) });
const fileBodyLimit = bodyLimit({ maxSize: MAX_UPLOAD_BYTES, onError: (c) => c.json({ error: "file_too_large" }, 413) });
const UPLOAD_PATH = /^\/cases\/[^/]+\/documents\/?$/;
app.use("*", (c, next) =>
  c.req.method === "POST" && UPLOAD_PATH.test(c.req.path) ? fileBodyLimit(c, next) : jsonBodyLimit(c, next),
);

app.get("/health", (c) => c.json({ ok: true }));
app.route("/auth", authRoutes);
app.route("/cases/:caseId/documents", documentsRoutes);
app.route("/cases", casesRoutes);
app.route("/account", accountRoutes);

app.onError((err, c) => {
  // Log the error type only. Messages and stacks can carry user data (names, document text).
  console.error("unhandled_error", err instanceof Error ? err.name : typeof err);
  return c.json({ error: "internal_error" }, 500);
});

export default app;
