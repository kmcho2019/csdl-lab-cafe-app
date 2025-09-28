# Troubleshooting Checklist

The fastest fixes for the issues you are most likely to encounter while operating Lab Cafe Hub.

## Authentication & Sessions

| Symptom | Fix |
| --- | --- |
| GitHub login fails with `Invalid Compact JWE` | Set `NEXTAUTH_SECRET` to a 32+ character value (no quotes) and restart the web container. Existing sessions will be invalidated. |
| `OAuthAccountNotLinked` when a seeded user signs in | Insert a row into `Account` linking the OAuth provider to the user (see [DB_OPERATIONS.md](./DB_OPERATIONS.md)#3). |
| User sees “Not allowed” | Confirm their email/domain is in `ALLOWLIST_DOMAINS` **or** `AllowlistEntry`, and that `User.isActive = true`. |

## Database & Docker

| Symptom | Fix |
| --- | --- |
| Prisma error “authentication failed for user” | Remove quotes from `POSTGRES_*` values, run `docker compose down --volumes`, and bring the stack back up so the database is reinitialised with the new password. |
| `DATABASE_URL` missing or incorrect | Verify `.env` exists, run `npm run dev` again (Next.js loads env only at boot), and double-check interpolation in `src/lib/env.ts`. |
| `pg_isready` healthcheck fails repeatedly | Another process may be bound to port 5432. Stop local Postgres installs or change `POSTGRES_PORT` + `DATABASE_URL` accordingly. |

## Inventory & Consumption

| Symptom | Fix |
| --- | --- |
| “Not enough stock to fulfill request” toast | Someone else depleted the item. Restock via `/app/inventory` or adjust the stock count in the database. |
| Restock/write-off API returns 500 | Inspect the browser console/network tab. Most failures are validation related (negative quantity, missing unit cost). Check server logs for additional error context. |
| Item price not updating settlements | Settlements use `priceAtTxCents`. Verify you added an `ItemPriceHistory` row when changing price and that future consumptions use the new cost. |

## Settlements & Ledger

| Symptom | Fix |
| --- | --- |
| Settlement list empty | No settlements exist yet. Insert a draft row manually or wait for the upcoming UI. |
| Ledger balance incorrect after restock | Ensure you supplied the unit cost when restocking. Without it, stock increases but no ledger entry is created. Add a manual `LedgerEntry` to reconcile. |

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
