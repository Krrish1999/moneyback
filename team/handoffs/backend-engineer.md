# Handoff log — backend-engineer

Newest entry first. Each entry: date, what was done, contract changes, how to verify, needs from others.

## 2026-11-12 · S2-08 document uploads → review (API and web, done by Claude in Kunal's desktop session)

### What I built
- **`POST /cases/:caseId/documents?type=<DocumentType>`**: the body is the file, `Content-Type` its type, `X-File-Name`
  the URL-encoded name. Needs session, consent (`requireConsent`) and ownership. Checks: type is PDF/JPEG/PNG and the
  first bytes agree with it (415 `unsupported_file_type`), not empty (400), at most 10 MB (413 `file_too_large`), at most
  20 documents per case (409 `too_many_documents`), case not won/lost/closed (409 `case_finished`), 60 uploads per user per
  hour. Same file in the same case again (SHA-256) returns the first copy with 200. Stored at
  `users/<userId>/cases/<caseId>/<documentId>`; if the row cannot be written the file is removed again.
- **`GET /cases/:caseId/documents`** → `DocumentSummary[]` (a `DocumentRecord` without `r2Key`).
- **`DELETE /cases/:caseId/documents/:documentId`**: only while the case is in `intake` (409 `case_locked` after).
- **Shared** `packages/shared/src/uploads.ts`: `MAX_UPLOAD_BYTES`, `MAX_DOCUMENTS_PER_CASE`, `UPLOAD_MIME_TYPES`,
  `sniffUploadMimeType`, `cleanFileName`, `DocumentSummary`.
- **Body limits:** JSON routes stay at 16 KB; only the upload route takes up to 10 MB. CORS allows `x-file-name`.
- **Web** `UploadPage.tsx` now lists, uploads and removes through the API, checks size and type on the phone first, and
  shows a message per document slot. Every slot takes several files. `MoneyBackApi` gained `listDocuments`,
  `uploadDocument`, `deleteDocument` (HTTP client and mock). Strings under `upload.limits`, `upload.errors.*`.
- **D-008 (proposed):** uploads go through the API, not signed URLs. Please accept or reject.

### How to verify
```
pnpm --filter @moneyback/api test      # 86 tests (24 new in test/documents.test.ts)
pnpm --filter @moneyback/web test      # 91 tests (21 new in test/upload.test.tsx)
pnpm --filter @moneyback/shared test   # 196 tests (17 new in test/uploads.test.ts)
```
`pnpm typecheck` and `pnpm test` green on 2026-11-12. Not verified: a real upload from the browser with a signed-in
user (the preview was signed out), and `pnpm e2e`.

### Not done / limits
- No download or preview route yet; nothing reads a stored file back.
- No virus scan. Files are stored and later read by the model only; they are never served to other users.
- HEIC photos (iPhone default) and WebP are refused. Aadhaar numbers inside images are not masked (needs B-05).
- The API and web dev servers must be restarted after `git pull`; `wrangler dev` exits if it reloads on a half-saved edit.

### Needs
- **product-manager:** accept or reject D-008.
- **security-legal-reviewer:** review the upload route (untrusted files) and re-check H-1/H-2 before any deploy.
- **qa-engineer:** e2e test that uploads a small PDF fixture.

## 2026-11-12 · Consent recording (API side of S2-03) + Cloudflare resources

### What I built
- **`CONSENT_VERSION`**, `AcceptConsentInput`, `ConsentRecord` in `packages/shared/src/consent.ts`.
- **Table `consents`** (user_id, version, accepted_at; primary key user_id + version; cascade on user delete).
  Migration `0002_glorious_albert_cleary.sql`.
- **`POST /account/consent { version }`** → `{ version, acceptedAt }`. 409 `consent_version_outdated` unless the version
  is the current one. Agreeing twice keeps the first time stamp.
- **`/auth/me` and `/auth/google`** now also return `consentVersion` (the current version if agreed, else null).
- **`requireConsent`** middleware in `src/consent.ts` → 403 `consent_required`. **S2-08 upload routes must use it**
  after `requireSession`.
- `DELETE /account` also removes the user's consent rows.
- **Cloudflare (F-001 done):** D1 `moneyback` (APAC) and R2 bucket `moneyback-docs` (APAC) exist; the D1 id is in
  `wrangler.jsonc`. Migrations 0000 and 0001 are applied remotely. **0002 is applied locally only**; run
  `wrangler d1 migrations apply moneyback --remote` before the first deploy. Nothing is deployed.

### How to verify
```
pnpm --filter @moneyback/api test      # 62 tests (12 new in test/consent.test.ts)
```

## 2026-11-12 · S2-02 → review; Google sign-in confirmed (done by Claude in Kunal's desktop session)

### What I built
- **F-011 done for local:** Kunal created the Google client. Its id is in `apps/api/wrangler.jsonc` and
  `apps/web/.env.local`. Kunal signed in with a real Google account on localhost and it worked.
- **Delete my data:** `DELETE /account` (needs a session). Deletes the user's R2 files first, then in one D1 batch the
  events, payments, letters, documents, cases, sessions, the user's rate-limit rows and the user. Clears the cookie.
  Returns `{ ok: true }`. If R2 fails the request is a 500 and no row is removed, so a retry works.
- **R2 key layout** `src/storage.ts`: every user file must live under `userFilePrefix(userId)` = `users/<userId>/`.
  Deletion removes keys named in `documents.r2_key` and `letters.pdf_r2_key` plus everything under that prefix, so an
  upload whose row was never written is still removed. **S2-08 must write under this prefix.**
- **Aadhaar masking** `packages/shared/src/aadhaar.ts`: `maskAadhaar(text, mode)` → `{ text, masked }`, replacing each
  number with `XXXX XXXX 1234`. Mode `"checksum"` (default) masks only 12-digit numbers that pass the Verhoeff check;
  mode `"any"` masks every 12-digit number starting 2–9 (for OCR text). Also `isAadhaarNumber`, `verhoeffValid`.

### Contract changes
- New route `DELETE /account`. CORS now allows `DELETE`.
- `@moneyback/shared` exports `maskAadhaar`, `isAadhaarNumber`, `verhoeffValid`, `AadhaarMaskMode`.

### How to verify
```
pnpm --filter @moneyback/shared test   # 179 tests (13 new in test/aadhaar.test.ts)
pnpm --filter @moneyback/api test      # 50 tests (6 new in test/account.test.ts)
```
`pnpm typecheck` and `pnpm test` were green on 2026-11-12.

### Not done / limits
- Masking covers text only. Aadhaar numbers inside uploaded images and PDFs are not masked; that needs the
  extraction step (B-05) to call `maskAadhaar` on extracted text, and a decision on the stored original file.
- 16-digit Aadhaar Virtual IDs and numbers in Devanagari digits are not masked.
- No retention job yet (rest of B-15). No web screen calls `DELETE /account` yet.

### Needs
- **founder:** F-013 (what deletion must keep: payment records, open cases).
- **ai-engineer:** call `maskAadhaar(text, "any")` on document text before it is stored or sent to the model (B-05).
- **frontend-engineer:** add `deleteAccount()` to `MoneyBackApi` and a "Delete my data" control with a confirm step (S2-03).
- **security-legal-reviewer:** please re-review H-2 (deletion and masking parts) against this entry.

## 2026-11-12 · S2-01 → review (done by Claude in Kunal's desktop session, on Windows)

### What I built
- **Sign-in:** `POST /auth/google` takes a Google ID token `{ credential }`, verifies it (RS256 signature against
  Google's keys, issuer, audience = `GOOGLE_CLIENT_ID`, expiry, verified email), creates the user on first sign-in and
  sets the session cookie. `GET /auth/me` returns `{ id, email }`. `POST /auth/logout` deletes the session row.
  With `GOOGLE_CLIENT_ID` empty the endpoint answers `503 auth_not_configured` (fails closed).
- **Sessions:** table `sessions`; the cookie `mb_session` is HttpOnly, Secure, SameSite=Lax, 30 days. D1 stores only
  the SHA-256 of the token.
- **Ownership:** every `/cases*` route requires a session. The owner comes only from the session; another user's case
  is a 404. The placeholder-user insert is deleted; users are created only by sign-in.
- **Rate limits** (`src/rate-limit.ts`, table `rate_limits`, atomic upsert in D1): 10 cases per user per hour, 30 per IP
  per hour, 20 sign-in attempts per IP per 10 minutes. IPs are stored hashed.
- **Hardening (review L-6, L-8):** 16 KB body limit, `Cache-Control: no-store` on every response, CORS with
  credentials for `ALLOWED_ORIGINS` only, 403 for unsafe methods from any other Origin, error logs carry the error
  name only, `/health` no longer reveals `APP_ENV`. `wrangler.jsonc` sets `workers_dev: false` and `preview_urls: false`.
- **Windows fixes** needed to run the suite on Kunal's PC: root `test` script used single quotes that cmd does not
  strip, so it matched no packages and exited 0 without running anything; `packages/rules/test/rules.test.ts` built a
  fixture path from `URL.pathname` (now `fileURLToPath`). qa-engineer and ai-engineer: please keep both.

### Contract changes
- `@moneyback/shared`: `CreateCaseInput` no longer has `userId` (a client-sent one is dropped). New
  `MAX_CLAIM_AMOUNT_PAISE` (Rs 10 crore) enforced in `CreateCaseInput`.
- API: all `/cases` calls need the session cookie → the web HTTP client must use `credentials: "include"`. New error
  bodies: `401 unauthenticated`, `403 forbidden_origin`, `413 body_too_large`, `429 rate_limited` (+ `Retry-After`).
- Env: new vars `GOOGLE_CLIENT_ID`, `ALLOWED_ORIGINS` (comma-separated). New migration `0001_lyrical_reavers.sql`
  (`sessions`, `rate_limits`, `users.google_sub`).
- apps/web: `DEV_USER_ID` removed (smallest change that keeps the build green; frontend-engineer please review).

### How to verify
```
pnpm typecheck
pnpm test      # 339 pass + 2 expected-fail; api is 44 (cases 25, auth 18, health 1)
```
Not run: `pnpm e2e` (Playwright browsers are not installed on this PC).

### Needs
- **founder:** F-011 (Google OAuth client id), F-012 (DNS for the subdomain). D-007 proposes Google sign-in over phone OTP.
- **frontend-engineer:** sign-in screen with Google Identity Services, HTTP client implementing `MoneyBackApi`.
- **security-legal-reviewer:** please re-review H-1 against this entry.

## 2026-11-06 · W1-02, W1-03, W1-04 → review

### What I built
- **W1-02** `packages/shared`: case state machine (`src/state-machine.ts`) per D-003, and Zod record schemas
  (`src/records.ts`) for user, case, document, letter, event and payment, plus `CreateCaseInput` for the API.
  The existing exports in `src/case.ts` are unchanged.
- **W1-04** `packages/shared/src/deadlines.ts`: a pure deadline engine. Every legal number and the forum order come
  from the caller's config. Tests use made-up numbers. Coverage is 100% for statements, branches, functions and lines,
  and `vitest.config.ts` enforces 100% on `deadlines.ts` and `state-machine.ts` when you run `pnpm --filter @moneyback/shared coverage`.
- **W1-03** `apps/api`: Drizzle schema (`src/db/schema.ts`), the first migration `migrations/0000_init.sql`
  (generated by drizzle-kit; `migrations/meta/` is drizzle-kit state and wrangler ignores it), and the routes
  `POST /cases` and `GET /cases/:id`. Before each test file, the Workers integration tests apply the real
  migrations to local D1 (`readD1Migrations` in vitest.config.ts → `TEST_MIGRATIONS` binding →
  `applyD1Migrations` in `test/apply-migrations.ts`). `/health` is unchanged. `wrangler.jsonc` is unchanged.
- New dev dependencies in shared: `vitest@5.1.0` and `@vitest/coverage-v8@5.1.0`. New scripts: shared `coverage`, and in api
  `db:generate` (drizzle-kit) and `db:migrate:local`.

### Contract: `@moneyback/shared` exports
- From before (unchanged): `CaseCategory`, `CaseStatus`, `Verdict`, `Forum`, `DocumentType`, `Paise`, `FeeKind`, `PRICES_PAISE`, `SUCCESS_FEE_RATE`.
- State machine: `CASE_TRANSITIONS` (the table), `TERMINAL_STATUSES`, `allowedTransitions(from)`, `isTerminal(s)`,
  `canTransition(from, to): boolean`, `transition(from, to): CaseStatus` (throws `IllegalTransitionError {from, to}`).
  Table: intake→analysing; analysing→review|draft; review→draft; draft→sent; sent→waiting;
  waiting→escalated|won|lost; escalated→waiting; every non-terminal state→closed. won/lost/closed are terminal.
- Records (camelCase, the API's JSON shapes): `UserRecord`, `CaseRecord`, `CreateCaseInput`, `DocumentRecord`,
  `LetterRecord` + `LetterStatus` (draft/approved/sent), `EventRecord` + `EventType` + `EventActor`,
  `PaymentRecord` + `PaymentStatus` (created/authorized/captured/failed/refunded). Primitives: `Id`,
  `IsoDateTime` (UTC timestamp), `IsoDate` (`YYYY-MM-DD`).
- Deadlines: `computeDeadlines(input): DeadlineResult`, with schemas `DeadlineInput`, `DeadlineConfig` and `ForumRule`, and helpers
  `addDays(date, n)` and `toIndiaDate(isoTimestamp)`.
  - `config = { forumOrder: Forum[], forums: { [forum]: { waitDaysBeforeEscalation, escalateEarlyOnReply, maxDaysToFile | null } } }`
  - `input = { currentForum: Forum | null, dates: { claimDecisionAt?, complaintSentAt?, replyAt? }, asOf, config }`
    (all `YYYY-MM-DD`; `currentForum: null` means no complaint filed yet, and the window to file at the first forum counts from `claimDecisionAt`).
  - result `{ nextForum, earliestEscalationDate, lastFilingDate, outOfTime, canEscalateNow }`.
  - Earliest escalation = complaintSentAt + current forum's wait. If the current forum replied *before then* and its
    `escalateEarlyOnReply` is true, the reply date is used instead. The next forum's `maxDaysToFile` counts from that date.
  - Invalid input (missing required date, reply before complaint, forum missing from order/rules, duplicate order)
    throws a `ZodError`.

### Endpoints (apps/api)
- `POST /cases` with body `CreateCaseInput` `{ userId, insurer, claimAmountPaise, category? = "health_insurance" }` returns `201` and a
  `CaseRecord` with `status: "intake"`. The insert also writes a `case_created` event and a placeholder `users` row in one D1 batch.
  Bad input returns `400 {error:"invalid_input", issues}`, and malformed JSON returns `400 {error:"invalid_json"}`. A client-sent `status` is ignored.
  **TODO(B-01):** `userId` comes from the body and anyone can create a case for any user id. The placeholder-user insert
  exists only so the foreign key holds until sign-up exists. Both are marked in `src/routes/cases.ts`.
- `GET /cases/:id` returns `200` and a `CaseRecord`, `404 {error:"not_found"}` if the case doesn't exist, or `400` for a malformed id. There is no ownership check yet (TODO B-01).
- Unhandled errors return `500 {error:"internal_error"}`.

### How to verify
```
pnpm --filter @moneyback/shared test       # 164 tests
pnpm --filter @moneyback/shared coverage   # 100% statements/branches/functions/lines
pnpm --filter @moneyback/api test          # 16 tests, Workers runtime + local D1 with migrations applied
pnpm --filter @moneyback/api db:generate   # should print "No schema changes"
pnpm typecheck                             # all green
```
`pnpm test` from the root failed on 2026-11-06 only in `e2e` ("No tests found": `e2e/tests/` is empty, which is QA's W1-09
and still in progress). All other packages passed.

### Requests / open questions
- **ai-engineer (W1-05):** please make the rules library produce a `DeadlineConfig` (`forumOrder` plus a `ForumRule` per forum),
  or tell me the shape you prefer and I'll write an adapter. The engine has no defaults on purpose.
- **ai-engineer / founder, legal semantics (not decided in code):** (1) If the insurer replies *after* the waiting period,
  the engine counts the next forum's filing window from the end of the waiting period. That is the earlier and more cautious date. Does the actual
  rule count from the reply date instead? (2) The engine counts days in India calendar dates. Callers should convert timestamps
  with `toIndiaDate`. Is "within N days" inclusive of the last day? The engine treats `lastFilingDate` as still in time.
- **qa-engineer:** root `pnpm test` stops on the empty `e2e/tests/`. Adding the smoke test (or `--pass-with-no-tests`
  until then) will unblock the root run.
- **product-manager:** D-003 has no backward moves (e.g. analysing→intake when more facts are needed, or a direct sent→won
  when the insurer pays before we enter `waiting`). I kept the table strict. Tell me if you want either of those added.
- **frontend-engineer:** the API JSON shapes are the `*Record` schemas above. Use `CaseRecord.parse` on responses.
