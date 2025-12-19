# Implementation Overview

This document describes the current state of Lab Cafe Hub as shipped in this repository. Use it alongside `AGENTS.md` (spec) and `README.md` (setup) to understand what is live, what is partially complete, and what remains on the roadmap.

## Platform Snapshot

- **Framework**: Next.js 15 App Router, TypeScript, Tailwind CSS.
- **Authentication**: Auth.js (NextAuth) with GitHub provider plus custom allowlist checks.
- **Database**: PostgreSQL with Prisma (see `prisma/schema.prisma`).
- **UI**: Shadcn/ui components + TanStack Query for client mutations.
- **Deployment assets**: Dockerfile & docker-compose for local Postgres; `.env.example` templated for both Compose and managed databases.

## Agent Delivery Status

| Agent / Area             | Status | Implementation Notes |
| ------------------------ | ------ | -------------------- |
| **Auth Agent**           | ✅     | GitHub OAuth with allowlist validation in `src/server/auth/options.ts`, plus automatic linking of GitHub accounts to pre-created users. Sessions are JWT-based and include role/isActive flags. |
| **Inventory Agent**      | ✅     | `/app/inventory` UI drives `/api/items` + `/api/items/:id/{restock,writeoff}` endpoints. Stock movements recorded with audit-friendly metadata. |
| **Settlement Agent**     | ✅     | `/app/settlements` supports draft creation, preview/corrections, **bill finalization** (BILLED), payment tracking, and settlement finalization (FINALIZED → ledger credit). Exports read from `SettlementLine` rollups. |
| **Ledger Agent**         | ✅     | Ledger dashboard at `/app/ledger` with balance chart + manual adjustments; restock/write-off APIs post balancing entries. |
| **Ordering Agent**       | ✅     | `/app/restocks` and `/api/purchase-orders` create multi-line purchase orders, restock stock, and debit the ledger in one flow. |
| **Analytics Agent**      | ✅     | Admin analytics page at `/app/analytics` shows popularity rankings and stock trend sparklines with low-stock highlighting. |
| **Notification Agent**   | ⏳     | Email templates and SMTP variables reserved; final delivery queue not yet wired. |
| **Kiosk checkout**       | ✅     | `/app/kiosk` supports member self-checkout (locked to own tab) and admin multi-user checkout via `/api/kiosk/checkout`. |

Legend: ✅ complete · 🚧 usable but missing pieces · ⏳ planned / not started.

## Core Flows Implemented

- **Member dashboard** (`/app`): lists active items grouped by category with one-tap “Take one” buttons powered by `POST /api/consumptions`.
- **Inventory operations**: create items (price/name/stock), edit existing items (name/price/category via dropdown + add-new), restock and write-off forms per item, archive/reactivate items (stock must be 0 + typed confirmation), ledger integration, and React Query mutations to keep the UI in sync.
- **Central restocks**: `/app/restocks` records multi-item purchase orders, adds stock movements, and debits the ledger with receipt metadata.
- **People management**: `/app/users` lets admins invite members, promote to admin, and freeze/reactivate accounts without touching SQL.
- **Kiosk checkout**: `/app/kiosk` provides a cart interface for admins to record multiple consumptions at once; `/api/kiosk/checkout` handles stock validation server-side.
- **Admin-only navigation**: server layout at `src/app/app/layout.tsx` gates inventory, people, settlements, and ledger to `Role.ADMIN`.
- **Consumption safety**: stock decrements happen atomically in a Prisma transaction; out-of-stock attempts return HTTP 409.
- **Transaction history**: `/app/transactions` lists cross-member consumption history with pagination and date filters.
- **Settlement corrections**: admins can reverse mistaken consumptions during the draft window; reversals restore stock and record audit logs.
- **Period overview**: `/app/overview` summarizes unsettled consumption totals by member and item.
- **Environment parsing**: `src/lib/env.ts` normalises Postgres variables, interpolates `${POSTGRES_*}` placeholders, and enforces a next-auth secret in production.

## File Map

- `src/app/app` – Authenticated routes: member dashboard, admin inventory/people/settlements/ledger/restocks/transactions/overview.
- `src/app/api` – REST endpoints (`/items`, `/items/:id/restock`, `/items/:id/writeoff`, `/purchase-orders`, `/consumptions`, `/settlements`, `/ledger`, `/admin/users`, `/admin/transactions`, `/me`).
- `src/components/items` & `src/components/inventory` – Client components for consumption and admin stock workflows.
- `src/lib` – Environment loader, currency formatter, Prisma client singleton.
- `prisma` – Schema, migrations, and `seed.ts` (demo users, allowlist domains, sample stock, opening ledger balance).

## Known Gaps & Next Steps

1. **Notifications** – Wire SMTP delivery + templates for settlement notices and reminders.
2. **Ledger exports** – Add CSV downloads and pagination for historical entries.
3. **Settlement void/reopen** – Admin UI + API path to safely void a billed/finalized settlement (with audit trail).
4. **Purchase order workflow** – Optional “ordered → received” state tracking (today all restocks are recorded as received).
5. **Analytics expansion** – Add deeper retention/elasticity views beyond popularity and low-stock.

Use this overview when planning new work: it clarifies which pieces are production-ready and which still rely on manual steps.
