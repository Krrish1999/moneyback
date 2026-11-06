# Handoff log — qa-engineer

Newest entry first. Each entry: date, what was done, contract changes, how to verify, needs from others.

## 2026-11-06 — W1-09 CI + Playwright smoke, W1-08 eval suite (both → `review`)

### Finished
- **CI** `.github/workflows/ci.yml` (push + pull_request): checkout → `pnpm/action-setup@v4` (version read from root
  `packageManager`, pnpm@10.28.0) → Node 22 with pnpm cache → `pnpm install --frozen-lockfile` → `pnpm typecheck` →
  `pnpm test` → `pnpm eval` (recorded outputs only, no live calls) → `pnpm --filter @moneyback/web build` →
  `playwright install --with-deps chromium` → `pnpm e2e`; uploads the Playwright report on failure. YAML validated.
- **e2e/**: `playwright.config.ts` (one project, 360x740 mobile viewport, touch; baseURL from `E2E_BASE_URL`/`BASE_URL`
  or http://localhost:4173; webServer runs `pnpm --filter @moneyback/web build && pnpm --filter @moneyback/web preview
  --port 4173 --strictPort` from the repo root, skipped when `E2E_BASE_URL` is set), `tsconfig.json`, `typecheck` script,
  `tests/smoke.spec.ts` (6 tests): home loads; no horizontal scroll at 360 px; language switch → Hindi (and it survives a
  reload); start-case → intake form; empty submit shows the error summary; valid intake → upload page → "Continue to my
  case" → case page with `case-timeline`, current step "Details received".
- **evals/** golden format (schema_version 1, Zod schema `GoldenCase` in `evals/runner/golden.ts`):
  `evals/golden/<case-id>/case.json` (metadata: `synthetic`, `title`, `rejection_codes`, `claim_type`, `outcome`, `notes`,
  `documents[] {id: "doc_N", type, title, file}`, `recorded_output {file, model, prompt_version, recorded_at}`,
  `expected: ExtractedClaimFacts`), `documents/doc_N_<type>.txt` (plain text), `recorded-output.json` (raw model text).
  `evals/golden/private/` (git-ignored) is skipped unless `--include-private`.
- 5 synthetic cases (fictional insurers Sample General / Demo Health / Example Health, invented people, SMPL-/DEMO-/EXH-
  numbers): 01 PED reimbursement, 02 waiting period cashless (pre-auth, no discharge date), 03 non-disclosure
  reimbursement, 04 room-rent proportionate deduction + consumables cashless partly paid, 05 documents missing
  reimbursement (no policy doc, so several nulls).
  **Deliberate misses** in recorded outputs: case 03 amount loses 50 paise + DD/MM date read as MM/DD; case 04 consumables
  coded `other`; case 05 invents a sum insured that should be null.
- Runner `pnpm eval [--threshold 0.9] [--case id] [--include-private] [--live]` (`EVAL_THRESHOLD` env also works):
  parses with `parseExtraction`, prints per-field × per-case table, per-case score, a list of misses with expected vs got,
  overall score; exits 1 below threshold. `--live` prints "not implemented" and exits 2. Scoring (`runner/scoring.ts`):
  money/date/enum exact, identifiers ignore case and whitespace, text normalised (case, punctuation, Co./Ltd./Pvt./&,
  keeps Devanagari), null vs value = miss, reason codes and clauses = multiset F1; confidence and source_document
  are not scored yet. Verdict agreement and out-of-library citations are listed as "not scored yet" (B-06).
- Tests: `test/scoring.test.ts` (money, date, text, null handling, F1, summary), `test/golden.test.ts` (every case valid,
  synthetic, fictional insurer, source docs exist, quotes verbatim in the cited doc, recorded output parses, no
  Aadhaar/PAN/mobile/email patterns), `test/parse-extraction-known-bugs.test.ts` (see bugs).

### Results (repo root, 2026-11-06)
- `pnpm typecheck` pass · `pnpm test` pass (evals 60 + 2 expected-fail) · `pnpm eval` 95.9% ≥ 90% PASS (4 misses, as
  designed; `--threshold 0.97` exits 1) · `pnpm e2e` 6/6 pass.

### Bugs and requests for others
- **product-manager — root `package.json`**: `pnpm test` (`pnpm -r --if-present test`) also runs the e2e package's
  `test` script, i.e. a full web build + Playwright inside the unit-test run (and in CI before browsers are installed).
  Please change root `test` to `pnpm -r --if-present --filter '!@moneyback/e2e' test`. Stopgap: `e2e/scripts/
  run-playwright.mjs` skips when `npm_config_if_present=true`; I'll remove it after your change. Also CLAUDE.md says
  `pnpm e2e` "needs dev:web running" — it now builds and serves the app itself (port 4173).
- **ai-engineer — `packages/prompts/src/parse.ts` `extractJsonText`** (tests in `evals/test/parse-extraction-known-bugs.test.ts`, as `it.fails`):
  - BUG-QA-1: prose containing `{` before the JSON (e.g. "Facts from {doc_1} below: {...}") → `invalid_json`; it takes
    the first `{` and doesn't try the next one.
  - BUG-QA-2: only the first ``` fence is used; a reply with an example fence followed by a ```json answer fails with
    `schema_mismatch`. Suggest: try each fenced block (json-tagged first), then each balanced object, return the first
    that validates. When fixed, change `it.fails` to `it`.
- **frontend-engineer**: (1) during my run `apps/web` test `validateIntake rejects {"claimAmount":"99999999999"}` failed
  (`amountInvalid` instead of `amountTooHigh`: `parseRupeesToPaise` allows only 10 digits); it passed a few minutes later,
  so please confirm it's fixed on purpose. (2) No handoff entry yet for W1-07; the e2e test relies on `start-case-button`,
  `intake-submit`, `language-switch`, `case-timeline` and the English labels and copy ("Insurance company",
  "Continue to my case", "Details received"). Tell me before renaming any of these. (3) For security-legal
  (W1-10): the intake hint names real insurers ("Star Health, HDFC ERGO, Niva Bupa"). Please check that's acceptable.

### How to verify
`pnpm typecheck && pnpm test && pnpm eval && pnpm e2e` from the repo root (Chromium must be installed; locally it's
preinstalled at `$PLAYWRIGHT_BROWSERS_PATH`).
