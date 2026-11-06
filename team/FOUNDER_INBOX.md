# Founder inbox — things only Kunal can do or decide

Agents append items here; Kunal marks them done. Format:
`- [ ] F-<n> · <from agent> · <date> · <what is needed> · <why it blocks> · <suggested answer, if any>`

- [ ] F-001 · product-manager · 2026-11-06 · Create a Cloudflare account (free), then run `pnpm --filter @moneyback/api exec wrangler d1 create moneyback` and paste the database id into `apps/api/wrangler.jsonc` · needed before any deploy · —
- [ ] F-002 · product-manager · 2026-11-06 · Create an Anthropic Console account with the company email, and add an API key to `apps/api/.dev.vars` as `ANTHROPIC_API_KEY=...` · needed for live extraction in week 3 · apply to Claude for Startups at the same time
- [ ] F-003 · product-manager · 2026-11-06 · Create a GitHub repository and push this folder · needed for CI and backups · private repo
- [ ] F-004 · product-manager · 2026-11-06 · Find 5–10 real rejected health-claim cases (friends, family) with consent, for the private golden set · eval quality depends on real cases · store them only in `evals/golden/private/` (git-ignored)
- [ ] F-005 · product-manager · 2026-11-06 · Confirm D-006 (go straight from the insurer to the ombudsman; Bima Bharosa optional, in parallel) · decides the deadline config and the escalation pack · suggested: yes
- [ ] F-006 · ai-engineer · 2026-11-06 · Check the 12 draft rules in packages/rules/rules/ against the official PDFs (both IRDAI circulars were read from a mirror site) before any is marked verified · production may cite only verified rules · ideally with an advocate
