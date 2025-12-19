# Troubleshooting Checklist

The fastest fixes for the issues you are most likely to encounter while operating Lab Cafe Hub.

## Authentication & Sessions

| Symptom | Fix |
| --- | --- |
| GitHub login fails with `Invalid Compact JWE` | Set `NEXTAUTH_SECRET` to a 32+ character value (no quotes) and restart the web container. Existing sessions will be invalidated. |
| `OAuthAccountNotLinked` after inviting/importing a user | The app should auto-link GitHub OAuth to an existing `User` on first sign-in. If it persists, confirm the email/domain is allowlisted and inspect `Account` for conflicting `provider='github'` + `providerAccountId` rows (see [DB_OPERATIONS.md](./DB_OPERATIONS.md)#3). |
| User sees “Not allowed” | Confirm their email/domain is in `ALLOWLIST_DOMAINS` **or** `AllowlistEntry`, and that `User.isActive = true`. |
| People form returns "Email or GitHub ID already exists" | The address or GitHub ID is already tied to another user. Search the table, reactivate the existing account, or clear the conflicting value before retrying. |

## Database & Docker

| Symptom | Fix |
| --- | --- |
| Prisma error “authentication failed for user” | Remove quotes from `POSTGRES_*` values, run `docker compose down --volumes`, and bring the stack back up so the database is reinitialised with the new password. |
| `DATABASE_URL` missing or incorrect | Verify `.env` exists, run `npm run dev` again (Next.js loads env only at boot), and double-check interpolation in `src/lib/env.ts`. |
| CI migrate step logs “DATABASE_URL not set” | Add `DATABASE_URL` as a GitHub Actions secret (repo or environment). `.env` files are not loaded in Actions. |
| CI migrate step fails with “No prisma/migrations directory” | Create a baseline migration (see `docs/DB_OPERATIONS.md`), or set `PRISMA_ALLOW_DB_PUSH=1` for a one-time schema push. |
| `docker: command not found` (or `docker compose` missing) | Expected inside the VS Code devcontainer; run `npx prisma ...` commands in the container and run Compose commands from your host terminal. See `docs/DEVCONTAINER.md`. |
| `pg_isready` healthcheck fails repeatedly | Another process may be bound to port 5432. Stop local Postgres installs or change `POSTGRES_PORT` + `DATABASE_URL` accordingly. |

## Inventory & Consumption

| Symptom | Fix |
| --- | --- |
| “Not enough stock to fulfill request” toast | Someone else depleted the item. Restock via `/app/inventory` or adjust the stock count in the database. |
| Restock/write-off API returns 500 | Inspect the browser console/network tab. Most failures are validation related (negative quantity, missing unit cost). Check server logs for additional error context. |
| Item price not updating settlements | Settlements use `priceAtTxCents`. Verify you added an `ItemPriceHistory` row when changing price and that future consumptions use the new cost. |
| Kiosk checkout says items are unavailable | Refresh `/app/kiosk` to pull the latest stock data; the item may have been disabled or restocked in another session. |

## Settlements & Ledger

| Symptom | Fix |
| --- | --- |
| Settlement list empty | Create a draft in `/app/settlements` (admins only). Drafts are created on demand rather than automatically. |
| Ledger balance incorrect after restock | Use `/app/restocks` for multi-item purchases so the ledger is debited automatically. Per-item restocks only create ledger entries when a unit cost is supplied. |

## General Dev

| Symptom | Fix |
| --- | --- |
| `vitest: not found` | Install dependencies (`npm install` or `docker compose run --rm web npm install`). |
| Hot reload misses env edits | Stop `npm run dev` and restart—Next.js only reads env variables at startup. |
| Typescript paths break in your IDE | Run `npm run prisma:generate` and `npm run typecheck` once so generated types land under `.prisma` and `.next`. |

Still stuck? Capture:
- Exact command / URL
- Console logs (`docker compose logs -f web`)
- Relevant environment values (without secrets)

Then open an issue or contact the maintainer with the details.
