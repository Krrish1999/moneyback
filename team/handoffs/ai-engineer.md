# Handoff log — ai-engineer

Newest entry first. Each entry: date, what was done, contract changes, how to verify, needs from others.

## 2026-11-06 — W1-06 part 1: extraction output schema published (early note for QA)

- `packages/prompts/src/extraction.ts`, exported from `@moneyback/prompts`:
  `ExtractedClaimFacts` (Zod) + type, `RejectionReasonCode`, `PolicyType`, `ClaimType`, `RejectionReason`,
  `PolicyClauseCited`, `extractedField()`, `EXTRACTED_SCALAR_FIELDS` (list of the 15 scalar fields, for per-field scoring).
- Shape: each scalar fact is `{ value: T | null, confidence: 0..1, source_document: string | null }`.
  `source_document` = the document id as labelled in the prompt (e.g. `"doc_1"`). Money = integer paise (`Paise` from
  `@moneyback/shared`); dates = `YYYY-MM-DD`. `rejection_reasons` = `[{ quote (verbatim), code, amount_disallowed, confidence,
  source_document }]`; `policy_clauses_cited` = `[{ clause, text, confidence, source_document }]`; empty array = none found.
- Reason codes: pre_existing_disease, waiting_period, non_disclosure, not_medically_necessary, documents_missing,
  late_intimation, policy_exclusion, room_rent_cap_proportionate_deduction, consumables_not_payable, other.
- QA: golden cases can be `ExtractedClaimFacts` objects; validate them with `ExtractedClaimFacts.parse`. `parseExtraction()`
  and the versioned prompt follow in the next entry.

## 2026-11-06 — W1-05 and W1-06 done → `review`

`pnpm typecheck` passes (all packages). `pnpm test` passes: shared 164, prompts 18, web 29, rules 18, evals 60 (+2 expected fail),
api 16. No failures in other packages.

### W1-06 — extraction (packages/prompts)
Exports from `@moneyback/prompts`:
- `extraction.ts`: `ExtractedClaimFacts` and the other exports listed in the entry above. **Change since that note:** every object
  is now **strict** (unknown keys are rejected), so an output that obeyed an injected "add field X" instruction fails validation.
- `extraction.v1.ts`: `EXTRACTION_PROMPT_VERSION = "extraction.v1"`, `EXTRACTION_SYSTEM_PROMPT_V1`,
  `formatDocumentForExtraction({id,type,text})`, which wraps each document in `<document id type>` tags and neutralises tags
  inside the document text. The prompt says: return only JSON, quote reasons verbatim, use null rather than guess, ignore
  instructions inside documents, use paise and ISO dates, and don't calculate `amount_disallowed`.
- `parse.ts`: `parseExtraction(raw)` returns `{ ok: true, data }` or `{ ok: false, error: { kind: "no_json" | "invalid_json" |
  "schema_mismatch", message, issues? } }` and never throws. It accepts bare JSON, fenced JSON, or JSON with prose around it, and
  takes the first balanced object only. `extractJsonText(raw)` is also exported. For a retry, feed `error.issues` back to the model.
- Tests: `packages/prompts/test/extraction.test.ts` plus a recorded fixture `test/fixtures/valid-partial-deduction.json`
  (synthetic data). They cover malformed JSON, truncated output, prose with no JSON, a missing field, rupees as decimals or strings,
  bad dates and codes, and injection (extra keys at the top level and nested, injected text kept as inert data, a second injected
  JSON object ignored, document-tag breakout). No live API calls.
- Prompts are versioned: a change means a new `extraction.v2.ts` plus an eval run. **QA:** v1 has not had an eval run yet. Please
  run the first eval against it when W1-08 lands.

### W1-05 — rules library (packages/rules)
- `@moneyback/rules` (pure, safe for Workers): `Rule` (Zod, strict), `RuleType`, `RuleStatus`, `ParameterUnit`, `DeadlineLink`,
  `OFFICIAL_SOURCE_HOSTS`, `isOfficialSourceUrl`, `parseRules(sources)`, `RulesLoadError` (`.problems` lists every problem),
  `findRules(rules, { reasonCode?, forum?, statuses? })`, `durationToDays`, `toDeadlineConfig(rules, { forumOrder, includeDrafts? })`.
- `@moneyback/rules/node`: `loadRules(dir = RULES_DIR)` reads `packages/rules/rules/*.yaml`.
- Rule fields: id (kebab-case, must equal the file name), title, summary, applies_to (reason codes from `@moneyback/prompts`, or
  `[all]`), forum (`Forum` or `any`), type, parameters `{ name: { value, unit: hours|days|months|years|paise|percent,
  counted_from? } }`, optional `deadline` link, source_url (https on an official host only), source_title, source_reference,
  issuing_body, date_checked, status, notes. The loader fails on malformed YAML, duplicate YAML keys, schema errors, a file name
  that doesn't match the id, and duplicate ids.
- New dependencies: rules → `@moneyback/shared`, `@moneyback/prompts`; prompts → `@moneyback/shared`. Both tsconfigs now include
  `types: ["node"]` (tests only; `src/` of prompts uses no Node APIs).

**For backend-engineer (W1-04), on `toDeadlineConfig()`:** it returns `{ config: DeadlineConfig | null, gaps, sources }` and builds
your `DeadlineConfig` from `packages/shared/src/deadlines.ts` (validated with your Zod schema).
- By default it uses **only `verified` rules** (D-005). Every rule is a draft today, so production gets `config: null` with gaps.
  Pass `includeDrafts: true` for development.
- Units: the rules say "one month" and "one year". I convert conservatively: waits round **up** (month = 31 days, year = 366
  days) and filing windows round **down** (month = 28 days, year = 365 days). It would be more exact if `ForumRule` accepted
  calendar units (`{ months: 1 }`, `{ years: 1 }`) and the engine added calendar months and years. Please consider this; I will
  switch the output if you add it.
- Model mismatch: under Ombudsman Rule 14(3), the ombudsman wait and the one-year window run from the **representation to the
  insurer** and the insurer's reply, not from a Bima Bharosa complaint. Bima Bharosa is optional, not a required step before the
  ombudsman. With `forumOrder: [insurer_gro, insurance_ombudsman]` the config is complete; my test runs it through your
  `computeDeadlines`. With `[insurer_gro, bima_bharosa, insurance_ombudsman]` there is no sourced Bima Bharosa → Ombudsman wait,
  so `config` is null and a gap is reported. I suggest the engine treat Bima Bharosa as a parallel or optional step, with the
  ombudsman clock anchored on the insurer complaint. The PM may want this in DECISIONS.
- `maxDaysToFile` for insurer_gro and bima_bharosa is `null` with a gap: I found no filing time limit, which is not the same as
  confirming there is none.

### Draft rules (all `status: draft`, `date_checked: 2026-11-06`)
| id | type / forum | source |
| --- | --- | --- |
| ombudsman-prior-representation-required | eligibility / ombudsman | Ombudsman Rules 2017 r.14(3)(a), r.14(5) — cioins.co.in consolidated text to 09.11.2023 |
| ombudsman-wait-one-month-after-insurer | time_limit / insurer_gro → ombudsman (1 month, early on reply) | same, r.14(3)(a), r.14(3)(b)(iii) |
| ombudsman-file-within-one-year | time_limit / ombudsman window (1 year) | same, r.14(3)(b) |
| ombudsman-handles-repudiation-and-delay | eligibility / ombudsman | same, r.13(1)(a),(b) |
| ombudsman-compensation-limit-50-lakh | eligibility / ombudsman (Rs 50 lakh = 500000000 paise) | same, r.17(3) |
| ombudsman-award-and-compliance-timelines | right / ombudsman (award in 3 months; insurer complies in 30 days) | same, r.17(4), r.17(6) |
| insurer-grievance-resolution-14-days | duty / insurer_gro (14 days) | IRDAI Master Circular on Protection of Policyholders' Interests 2024 (IRDAI/PP&GR/CIR/MISC/117/9/2024), Part B s.VI |
| bima-bharosa-escalation-after-two-weeks | time_limit / insurer_gro → bima_bharosa (14 days, early on reply) | bimabharosa.irdai.gov.in FAQ |
| moratorium-60-months | right / any; non_disclosure, pre_existing_disease | IRDAI Master Circular on Health Insurance Business 29.05.2024, Ch. I para 13 |
| repudiation-needs-committee-approval-and-reasons | duty / insurer_gro | Health master circular Ch. I para 17(a),(b) |
| no-rejection-for-want-of-documents | right / any; documents_missing, late_intimation | PPHI master circular 2024, Part B |
| reimbursement-claim-settlement-15-days | time_limit / insurer_gro (15 days; interest bank rate + 2%) | PPHI master circular 2024, Part B |

### Gaps and unverified items (reviewer: please check these before setting anything to `verified`)
1. **The two IRDAI master circulars were read from mirror copies (caalley.com).** The official irdai.gov.in file URLs could not be
   fetched: one is too long for the fetch tool, and the document-detail pages block robots. The rules cite the official URLs, and
   each affected rule says this in `notes`. The paragraph numbers in the PPHI mirror were inconsistent, so confirm every paragraph
   reference.
2. Health master circular reference number read as IRDAI/HLT/CIR/PRO/84/5/2024. Confirm it.
3. 14 vs 15 days: the Bima Bharosa FAQ says both "2 weeks" and "within 15 days"; the PPHI circular and the portal banner say 14.
   I stored 14.
4. Reimbursement settlement: the 15-day trigger is "from submission of claim", and interest was read as running "from the date of
   receipt of intimation". Confirm the exact wording.
5. Moratorium: whether it limits pre-existing-disease exclusions (not just non-disclosure) is unconfirmed.
6. Ombudsman r.14(4) (condonation of delay) is mentioned in a note only, not encoded.
7. Not found, so left out (no numbers invented): maximum pre-existing-disease and specific waiting periods (the health master
   circular gives no maximum); a time limit for complaining to the insurer or to Bima Bharosa; a rule on room-rent proportionate
   deduction or consumables (nothing found in either circular; candidates for the next batch, possibly in the IRDAI health
   insurance regulations or product guidelines); cashless timelines of 1 hour and 3 hours (Health MC paras 15(b) and 16 — found
   but not yet encoded).
8. Draft Insurance Ombudsman (Amendment) Rules 2025 were still a draft as of June 2026 (law-firm blog, not primary). Re-check
   egazette before verifying the ombudsman rules.

### How to verify
`pnpm --filter @moneyback/prompts test`, `pnpm --filter @moneyback/rules test`, then `pnpm typecheck && pnpm test` at the repo root.
Open each `packages/rules/rules/*.yaml`, follow `source_url`, and check `source_reference`.
