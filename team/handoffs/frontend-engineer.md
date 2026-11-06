# Handoff log — frontend-engineer

Newest entry first. Each entry: date, what was done, contract changes, how to verify, needs from others.

## 2026-11-06 · W1-07 web app shell → review

### What I built (all in `apps/web/`)
- **Routes** (react-router 8, data mode, `src/routes.tsx`). All routes share one layout: a header with the language switch, and a footer that says "MoneyBack is a complaint-filing assistant, not a law firm."
  - `/`: home page. Explains what MoneyBack does, has the "Start a free case check" button, and a "How fees work" list. Prices come from `PRICES_PAISE` and `SUCCESS_FEE_RATE`.
  - `/cases/new`: intake form with insurer, claim type (cashless or reimbursement), claim amount in ₹, rejection date and what the insurer said. Validation is in `src/features/intake/validation.ts`.
  - `/cases/:id/upload`: one slot each for policy, rejection letter, discharge summary and bills (bills can take several files). This is UI only: files stay in React state and nothing is uploaded.
  - `/cases/:id`: case summary, next deadline, and a timeline built from `CaseStatus`.
  - `*`: 404 page.
  - `/cases/demo`: a sample case that always exists in the mock (status `waiting`, with a made-up deadline). It is labelled "Sample case with demo data".
- **API client** (`src/api/`): the `MoneyBackApi` interface has `createCase(body: z.input<typeof CreateCaseInput>) → CaseRecord` and `getCase(id) → CaseRecord`. `getCase` rejects with `ApiError(404)`. `createMockApi()` keeps cases in memory and validates input with `CreateCaseInput`, the same way the API does. Screens get the client through `<ApiProvider>`/`useApi()`, so the real HTTP client can replace the mock in `src/main.tsx` without changing any screen. Domain types are imported from `@moneyback/shared` and not redefined.
- **i18n**: `src/i18n/en.ts` and `hi.ts` (Hindi in Devanagari). `hi` is typed as `Messages = typeof en`, so a missing or extra Hindi key fails typecheck. Status copy is checked with `satisfies Record<CaseStatus, …>`. The chosen language is saved under localStorage key `moneyback.language`; reads and writes are wrapped in try/catch. `<html lang>` is updated when the language changes.
- **Formatting**: `src/lib/money.ts` has `formatRupees(paise)`, which uses integer maths and Indian digit grouping (₹1,00,000), plus `formatRate` and `parseRupeesToPaise`. `src/lib/dates.ts` displays timestamps in Asia/Kolkata and formats `IsoDate` deadlines with no time-zone shift.
- **PWA**: set up with `vite-plugin-pwa` (generateSW, autoUpdate). The manifest has name and short_name "MoneyBack", theme `#0d5c55`, background `#f7f5f0`, and two SVG icons: `public/icon.svg` and `public/icon-maskable.svg`.
- **Accessibility and style**: designed mobile-first at 360 px. All text is at least 16 px (measured with Playwright). Every input has a real label, and hint and error text are linked with `aria-describedby`. An error summary appears with `role="alert"`, and focus moves to the first invalid field. Focus outlines are visible (3 px amber), there is a skip link, and the current timeline step has `aria-current="step"`. Contrast: ink on paper is about 15:1, muted text about 7:1, and white on the brand colour about 7.6:1.
- **Placeholder copy (founder must approve)**: all fee wording (`home.fees.*` in both languages, and `HomePage.tsx`) is marked PLACEHOLDER in code comments. There is no consent text yet. The product is never called a lawyer or legal advice.
- **Dev dependency added**: `vitest@5.1.0` in `apps/web`, the same version as the root. Test config is in `apps/web/vitest.config.ts` (jsdom, `test/setup.ts`).

### Test ids (used by the QA smoke test)
| `data-testid` | Element |
| --- | --- |
| `start-case-button` | home page call-to-action link → `/cases/new` |
| `intake-submit` | intake form submit button |
| `language-switch` | header button that toggles between English and Hindi |
| `case-timeline` | the timeline `<ol>` on `/cases/:id`. Each `<li>` has `data-status` and `data-state` (`done`, `current` or `upcoming`), and the current step has `aria-current="step"` |
| `next-deadline` | (extra) the deadline text on `/cases/:id` |

### How to verify
```
pnpm --filter @moneyback/web build   # tsc + vite build + service worker
pnpm --filter @moneyback/web test    # 33 tests: fee formatter, rupee parsing, intake validation, form render, language switch, timeline
pnpm typecheck && pnpm test          # all green on 2026-11-06
pnpm e2e                             # QA smoke: 6/6 pass against this build
```
Screenshots at 360×740 (taken from `vite preview`): `apps/web/screenshots/home-360.png`, `intake-360.png`,
`home-360-hi.png`, `case-demo-360-full.png`. Playwright also found no console errors and no horizontal scrolling on any route.

### Requests and open questions
- **backend-engineer**: the intake form collects three answers that `CreateCaseInput` and `CaseRecord` don't have fields for yet: `claimType` (`cashless | reimbursement`), `rejectionDate` (`IsoDate`, which is the deadline engine's `claimDecisionAt`) and `insurerStatement` (free text up to 2000 characters, untrusted). For now they live only in memory on the device (`src/features/intake/extrasStore.ts`) and are not sent to the API. Please add them to `packages/shared`, including a `ClaimType` enum to replace my temporary one in `src/api/types.ts`. Two more requests: (1) add the next forum next to `nextDeadline` (the engine already returns `nextForum`), so the UI can say who the deadline is with; (2) add a way to get status history (for example `GET /cases/:id/events`), so the timeline can show real dates. Until then, the timeline infers earlier steps from the current status.
- **backend-engineer / B-01**: the web app sends `userId: "dev-web-user"` (`DEV_USER_ID`, marked TODO(B-01)) because `CreateCaseInput` requires a user id.
- **qa-engineer**: (1) Yes, the `99999999999` test change was on purpose. The parser accepts at most 10 digits, so that input is now `amountInvalid`, and the "too high" test uses `9999999999` (₹999 crore, above the ₹10 crore cap). (2) The ids and English labels your smoke test uses are stable. I'll tell you before renaming any of them. (3) Mock data is lost on page reload, so e2e must reach `/cases/:id` by navigating inside the app, or use `/cases/demo`.
- **security-legal-reviewer (W1-10)**: (1) the hint on the insurer field names real insurers as examples ("Star Health, HDFC ERGO, Niva Bupa"); (2) the fee wording is placeholder; (3) the upload page says "For now, files stay on this phone. Nothing is uploaded yet." That is true only for the mock and must change when B-02 lands.
- **product-manager / founder**: fee wording needs approval, in both English and Hindi. Kunal has the final say on the Hindi text.
- **Bundle size**: the JS bundle is 153 KB gzipped, mostly react-dom, react-router and zod (zod comes in through the `@moneyback/shared` schemas). This is acceptable for the shell, but on slow 4G it is worth reducing later, for example with `zod/mini` in shared or by lazy-loading routes after sprint 1.
- **PWA icons**: the icons are SVG only. Some older Android launchers want 192 and 512 px PNGs, which could be generated later with `@vite-pwa/assets-generator`.
