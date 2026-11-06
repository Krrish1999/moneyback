# Task board

Status: `todo` · `doing` · `blocked` · `review` · `done`. Update only rows you own. Newest sprint first.

## Sprint 1 — week 1 (9–15 Nov 2026): foundations

| ID | Task | Owner | Status | Depends on | Done when |
| --- | --- | --- | --- | --- | --- |
| W1-01 | Monorepo scaffold, team operating system | product-manager | done | — | `pnpm typecheck` and `pnpm test` pass; CLAUDE.md, agents, board exist |
| W1-02 | Case state machine + Zod schemas for case, document, letter, event, payment in `packages/shared` | backend-engineer | todo | W1-01 | Allowed transitions encoded and unit-tested; every illegal transition rejected |
| W1-03 | D1 schema (Drizzle) + first migration + `POST /cases`, `GET /cases/:id` with Workers integration tests | backend-engineer | todo | W1-02 | Integration tests run against local D1; inputs validated with Zod |
| W1-04 | Deadline engine: given forum, dates and rule config, return next forum, earliest and latest filing dates | backend-engineer | todo | W1-02 | Pure functions; 100% branch coverage; no hard-coded legal numbers (all from config) |
| W1-05 | Rules library: Zod schema, YAML loader, validation tests, first draft rules for health-claim rejections with official source links | ai-engineer | todo | W1-01 | Every rule has source URL, date checked, `status: draft`; loader rejects malformed rules |
| W1-06 | Extraction prompt + output schema for claim documents (no live API calls in tests) | ai-engineer | todo | W1-02 | Zod schema for extracted facts; prompt versioned; a mock-model test proves parsing and validation |
| W1-07 | Web app shell: routes, English + Hindi strings, mobile-first screens (home, new case, upload, case timeline) on mock data, PWA manifest | frontend-engineer | todo | W1-01 | `pnpm --filter @moneyback/web build` passes; screens usable at 360 px width |
| W1-08 | Golden case format + 5 synthetic cases + eval runner that scores extraction from recorded outputs | qa-engineer | todo | W1-06 | `pnpm eval` prints a per-field score report; no real personal data in repo |
| W1-09 | GitHub Actions CI (typecheck, test, build) + Playwright smoke test of the web shell | qa-engineer | todo | W1-07 | Workflow file valid; `pnpm e2e` passes locally against the dev server |
| W1-10 | Security and legal review of sprint 1 | security-legal-reviewer | todo | W1-02..09 | Report in `team/reviews/`; founder items filed in FOUNDER_INBOX |

## Backlog — weeks 2–8 (PM refines at the start of each sprint)

| ID | Task | Owner | Week |
| --- | --- | --- | --- |
| B-01 | Phone OTP (or Google) login, sessions, ownership checks on every case route | backend-engineer | 2 |
| B-02 | R2 signed upload URLs, file type/size limits, SHA-256 dedupe | backend-engineer | 2 |
| B-03 | Case agent Durable Object: state, chat history, deadline alarms | backend-engineer | 3 |
| B-04 | Claude client wrapper: model tiers, prompt caching, retries, token logging | ai-engineer | 3 |
| B-05 | Document extraction live on Claude; golden-set score ≥ target set by PM | ai-engineer | 3–4 |
| B-06 | Case assessment (strong / possible / weak) citing only library rules; citation checker | ai-engineer | 4 |
| B-07 | Intake chat UI (English/Hinglish), streamed replies over WebSocket | frontend-engineer | 3–4 |
| B-08 | Complaint letter drafting + PDF generation | ai-engineer, backend-engineer | 5 |
| B-09 | Draft review + approve screen; filing-fee payment (Razorpay UPI) | frontend-engineer, backend-engineer | 5–6 |
| B-10 | Case email address: outbound send (Resend) + inbound replies (Email Routing) + settlement detection | backend-engineer | 5–6 |
| B-11 | Escalation pack: Bima Bharosa and ombudsman pre-filled forms | ai-engineer, frontend-engineer | 6 |
| B-12 | UPI AutoPay mandate for success fee | backend-engineer | 6 (needs founder: Razorpay account) |
| B-13 | Admin review queue | frontend-engineer, backend-engineer | 6 |
| B-14 | Nightly eval in CI, release gate on scores | qa-engineer | 4 |
| B-15 | Data deletion, retention job, Aadhaar-number stripping | backend-engineer, security-legal-reviewer | 7 |
| B-16 | Beta with 50 real cases; weekly metrics report | product-manager | 7–8 |
