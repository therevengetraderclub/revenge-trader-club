# The Revenge Trader Club

A trading discipline journal. Pre-trade checklist, kill switch, daily check-in,
goal tracking, and a trade journal with chart screenshots.

**Not financial advice.** RTC does not tell anyone what or how to trade.
It records the trader's own process and holds them to it.

## Deploy

Netlify serves `index.html` from the repo root. Pushing to `main` deploys to
production; every other branch gets a deploy preview URL.

Rollback: Netlify → Deploys → pick a previous deploy → "Publish deploy".

## Secrets

Nothing secret lives in this repo. `.env` is gitignored.

- Supabase **anon key** — safe in the browser. Protected by row-level security.
- Supabase **service_role key** — NEVER in frontend code. Netlify env var only,
  used by serverless functions. It bypasses every RLS policy.
- Stripe **secret key** — same rule. Server side only.

## Architecture

See `docs/ARCHITECTURE.md`.
