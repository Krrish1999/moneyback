# Task board

Status: `todo` · `doing` · `blocked` · `review` · `done`. Update only rows you own. Newest sprint first.

## Sprint 2 — week 2 (16–22 Nov 2026): security gates first, then login and uploads

Order set by the sprint-1 review (team/reviews/sprint-1.md). Nothing is deployed until S2-01 is done and F-007 is answered.

| ID | Task | Owner | Status | Depends on | Done when |
| --- | --- | --- | --- | --- | --- |
| S2-01 | B-01 login + ownership checks + rate limit; remove userId-from-body and placeholder users (review H-1) | backend-engineer | todo | — | Every case route rejects other users' cases in tests; no route trusts a client-sent user id |
| S2-02 | Data deletion design + delete endpoint (D1 rows and R2 files) and Aadhaar-number masking helper, moved up from B-15 (H-2) | backend-engineer | todo | S2-01 | Delete removes every row and file for a user in tests; masking unit-tested |
| S2-03 | Consent + privacy screens wired before upload, text marked pending founder approval (H-2, F-010) | frontend-engineer | todo | — | Upload is unreachable without recorded consent version |
| S2-04 | Fee copy rewritten to match D-002 exactly, no outcome promises, footer disclaimers (H-3, M-4) | frontend-engineer | todo | F-008 | Reviewer signs off; founder approves wording |
| S2-05 | parseExtraction: reject replies with more than one candidate object; fix BUG-QA-1/2 without widening the hole (M-1) | ai-engineer | todo | — | QA's known-bug tests flip to passing; attacker-first-object test rejected |
| S2-06 | Field length limits + runtime check that quotes appear in their cited document (M-2) | ai-engineer | todo | — | Eval and unit tests cover an injected quote |
| S2-07 | findRules verified-only by default; verified rules require verified_by/on/against; CI check blocks drafts in production (M-3) | ai-engineer, qa-engineer | todo | — | CI fails on a verified rule without evidence |
| S2-08 | B-02 R2 signed uploads (only after S2-01..S2-03) | backend-engineer | todo | S2-01, S2-03 | Upload limits and type checks tested |
| S2-09 | Pin CI actions to commit SHAs; CODEOWNERS on packages/rules (L-5, M-3) | qa-engineer | todo | — | Workflow passes with pinned actions |

## Sprint 1 — week 1 (9–15 Nov 2026): foundations

| ID | Task | Owner | Status | Depends on | Done when |
| --- | --- | --- | --- | --- | --- |
| W1-01 | Monorepo scaffold, team operating system | product-manager | done | — | `pnpm typecheck` and `pnpm test` pass; CLAUDE.md, agents, board exist |
| W1-02 | Case state machine + Zod schemas for case, document, letter, event, payment in `packages/shared` | backend-engineer | done | W1-01 | Allowed transitions encoded and unit-tested; every illegal transition rejected |
| W1-03 | D1 schema (Drizzle) + first migration + `POST /cases`, `GET /cases/:id` with Workers integration tests | backend-engineer | done | W1-02 | Integration tests run against local D1; inputs validated with Zod |
| W1-04 | Deadline engine: given forum, dates and rule config, return next forum, earliest and latest filing dates | backend-engineer | done | W1-02 | Pure functions; 100% branch coverage; no hard-coded legal numbers (all from config) |
| W1-05 | Rules library: Zod schema, YAML loader, validation tests, first draft rules for health-claim rejections with official source links | ai-engineer | done | W1-01 | Every rule has source URL, date checked, `status: draft`; loader rejects malformed rules |
| W1-06 | Extraction prompt + output schema for claim documents (no live API calls in tests) | ai-engineer | done | W1-02 | Zod schema for extracted facts; prompt versioned; a mock-model test proves parsing and validation |
| W1-07 | Web app shell: routes, English + Hindi strings, mobile-first screens (home, new case, upload, case timeline) on mock data, PWA manifest | frontend-engineer | done | W1-01 | `pnpm --filter @moneyback/web build` passes; screens usable at 360 px width |
| W1-08 | Golden case format + 5 synthetic cases + eval runner that scores extraction from recorded outputs | qa-engineer | done | W1-06 | `pnpm eval` prints a per-field score report; no real personal data in repo |
| W1-09 | GitHub Actions CI (typecheck, test, build) + Playwright smoke test of the web shell | qa-engineer | done | W1-07 | Workflow file valid; `pnpm e2e` passes locally against the dev server |
| W1-10 | Security and legal review of sprint 1 | security-legal-reviewer | done | W1-02..09 | Report in `team/reviews/`; founder items filed in FOUNDER_INBOX |

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
