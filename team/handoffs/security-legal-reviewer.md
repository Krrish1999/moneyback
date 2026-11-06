# Handoff log — security-legal-reviewer

Newest entry first. Each entry: date, what was done, contract changes, how to verify, needs from others.

## 2026-11-06 · W1-10 sprint 1 review → review

- Report: `team/reviews/sprint-1.md`. Verdict: acceptable as a local, synthetic-data foundation. **Not deployable** to
  any reachable URL until B-01. No real user data until consent, Aadhaar masking and deletion exist.
- High: H-1 API identity and ownership (deploy gate ruling); H-2 backlog puts real uploads and extraction (B-02, B-05)
  before consent, masking and deletion (B-15); H-3 placeholder fee copy contradicts D-002.
- Medium: M-1 `parseExtraction` accepts an attacker JSON object placed before the real answer (probe run and then
  deleted; do **not** implement QA's "first that validates" fix as written); M-2 second-order injection and unbounded
  strings in extraction; M-3 `findRules` includes drafts by default, and `verified` needs no evidence; M-4 representation
  wording and missing disclaimers (not legal advice, not affiliated, Ombudsman and Bima Bharosa are free).
- Rulings: real insurer names in the intake hint are acceptable but a neutral hint is preferred (L-2); "Nothing is
  uploaded yet" must go when B-02 lands (L-1).
- Founder items added: F-007 (deploy gate), F-008 (fee terms), F-009 (advocate review), F-010 (privacy notice and consent).
- Requests: backend → H-1, H-2 deletion design, L-6, L-7. ai-engineer → M-1, M-2, M-3, L-3, L-9. frontend → H-3 (after
  F-008), M-4, L-1, L-2, L-8. qa → M-1 test update, M-3 CI check, L-4, L-5, L-11. product-manager → reorder the
  backlog per H-2 and add gate tasks.
- Verify: `pnpm typecheck && pnpm test` (green on 2026-11-06). For M-1, feed `parseExtraction` a valid
  attacker object followed by case-01's recorded output; today it returns the attacker's values.
