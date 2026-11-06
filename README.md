# MoneyBack

An AI complaint-filing assistant that helps Indians recover money from companies. Version 1: rejected health-insurance claims.

Start with [CLAUDE.md](CLAUDE.md) — it explains the product, the AI agent team, and how they work together.

- Task board: [team/BOARD.md](team/BOARD.md)
- Things waiting on the founder: [team/FOUNDER_INBOX.md](team/FOUNDER_INBOX.md)
- Decisions: [team/DECISIONS.md](team/DECISIONS.md)

## Run it

```
pnpm install
pnpm test
pnpm dev:api   # http://localhost:8787/health
pnpm dev:web   # http://localhost:5173
```

Requires Node 22+ and pnpm 10 (`npm install -g pnpm`).
