# Decision log

Format: `D-<n> · title · status (proposed / accepted / superseded) · date · who` then context, decision, consequences.

## D-001 · TypeScript monorepo on Cloudflare · accepted · 2026-11-06 · founder
Context: one engineer plus AI agents; free tier matters. Decision: pnpm monorepo, Workers + Hono, D1, R2, Durable Objects,
React PWA on Pages. Consequences: Python is used only for offline tooling, if at all.

## D-002 · Hybrid fee model · accepted · 2026-11-06 · founder
Context: insurers pay the user or the hospital, never MoneyBack, so "pay only if you win" leaks.
Decision: free case check; Rs 299 filing fee before the complaint is released; Rs 499 escalation pack; 10% success fee
via UPI AutoPay mandate set up at case start. Prices live in `packages/shared/src/case.ts`.
Consequences: payment step is part of the draft-approval flow; mandate rules need confirming with Razorpay.

## D-003 · Case lifecycle states · accepted · 2026-11-06 · product-manager
States: intake → analysing → review? → draft → sent → waiting → (escalated → waiting)* → won | lost; any non-terminal
state → closed. `review` is entered when the admin queue rules require it. Backend owns the exact transition table.

## D-004 · Deadlines are code, not model output · accepted · 2026-11-06 · founder
The model never decides which forum is next or what the last filing date is. The deadline engine computes both from
rule config in the rules library, so they are unit-testable.

## D-005 · Rules start as drafts · accepted · 2026-11-06 · founder
Agents may add rules only with `status: draft`. A rule becomes `verified` only after Kunal (or a reviewing advocate)
checks the source. Production drafting may cite only `verified` rules.

## D-006 · Escalation path: insurer → ombudsman, Bima Bharosa in parallel · proposed · 2026-11-06 · product-manager
Context: the AI engineer found the ombudsman's one-year clock runs from the complaint to the insurer, and Bima Bharosa is
not a required step before the ombudsman (Insurance Ombudsman Rules 2017, r.14(3)). No sourced waiting period exists
between Bima Bharosa and the ombudsman. Proposal: the deadline engine's forum order is insurer_gro → insurance_ombudsman;
Bima Bharosa is offered as an optional parallel complaint after 14 days, not a gate. Needs founder confirmation (F-005)
because it changes what the Rs 499 escalation pack contains.

## D-007 · Sign-in with Google for the beta, not phone OTP · proposed · 2026-11-12 · backend-engineer
Context: B-01 allowed "phone OTP (or Google)". SMS OTP in India needs a provider account and (to our understanding) DLT
registration of the sender and template, which adds a paid dependency and a delay; almost every Android phone already has a
Google account. Decision: the beta signs in with Google only (ID token verified by the API, session cookie). Phone OTP can be
added later behind the same session layer. Consequences: needs a Google OAuth web client id (F-011); users without a Google
account cannot sign in during the beta.

## D-008 · Uploads go through the API, not R2 signed URLs · proposed · 2026-11-12 · backend-engineer
Context: B-02 said "R2 signed upload URLs". Signed URLs need R2 S3 access keys (a new secret) and let the browser write to the
bucket before the API has seen the bytes, so size and file-type checks can only run afterwards. Decision: the browser sends the
file to `POST /cases/:id/documents`; the Worker checks session, ownership, consent, size (10 MB) and the file's first bytes, then
writes to R2 through the bucket binding. The bucket has no public or signed access. Consequences: no R2 keys to manage; every
upload uses Worker CPU and memory (files are read fully into memory, fine at 10 MB); a larger limit later would need streaming
or signed URLs.
