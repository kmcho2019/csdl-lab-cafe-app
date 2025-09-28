# Implementation Overview

This document describes the current state of Lab Cafe Hub as shipped in this repository. Use it alongside `AGENTS.md` (spec) and `README.md` (setup) to understand what is live, what is partially complete, and what remains on the roadmap.

## Platform Snapshot

- **Framework**: Next.js 14 App Router, TypeScript, Tailwind CSS.
- **Authentication**: Auth.js (NextAuth) with GitHub provider plus custom allowlist checks.
- **Database**: PostgreSQL with Prisma (see `prisma/schema.prisma`).
- **UI**: Shadcn/ui components + TanStack Query for client mutations.
- **Deployment assets**: Dockerfile & docker-compose for local Postgres; `.env.example` templated for both Compose and managed databases.

## Agent Delivery Status

| Agent / Area             | Status | Implementation Notes |
| ------------------------ | ------ | -------------------- |
| **Auth Agent**           | ✅     | GitHub OAuth with allowlist validation in `src/server/auth/options.ts`. Sessions are JWT-based and include role/isActive flags. |
| **Inventory Agent**      | ✅     | `/app/inventory` UI drives `/api/items` + `/api/items/:id/{restock,writeoff}` endpoints. Stock movements recorded with audit-friendly metadata. |
| **Settlement Agent**     | 🚧     | Schemas and listing UI exist (`/app/settlements`), but draft/finalize flows still require manual SQL or scripts. See `SETTLEMENTS.md` for the intended lifecycle. |
| **Ledger Agent**         | ✅     | Ledger entries surface at `/app/ledger`; restock/write-off APIs optionally post balancing entries. Manual inserts supported through SQL or Prisma. |
| **Ordering Agent**       | ⏳     | Purchase order tables exist; UI and API wiring are not yet implemented. |
| **Analytics Agent**      | ⏳     | Low stock messaging appears inline; full reports/exports still pending. |
| **Notification Agent**   | ⏳     | Email templates and SMTP variables reserved; final delivery queue not yet wired. |
| **Kiosk checkout**       | ✅     | `/app/kiosk` cart drives `/api/kiosk/checkout`, recording multi-item consumptions per member on shared tablets. |

Legend: ✅ complete · 🚧 usable but missing pieces · ⏳ planned / not started.

## Core Flows Implemented

- **Member dashboard** (`/app`): lists active items grouped by category with one-tap “Take one” buttons powered by `POST /api/consumptions`.
- **Inventory operations**: create items (price/name/stock), edit existing items (name/price/category via dropdown + add-new), restock and write-off forms per item, ledger integration, and React Query mutations to keep the UI in sync.
- **People management**: `/app/users` lets admins invite members, promote to admin, and freeze/reactivate accounts without touching SQL.
- **Kiosk checkout**: `/app/kiosk` provides a cart interface for admins to record multiple consumptions at once; `/api/kiosk/checkout` handles stock validation server-side.
- **Admin-only navigation**: server layout at `src/app/app/layout.tsx` gates inventory, people, settlements, and ledger to `Role.ADMIN`.
- **Consumption safety**: stock decrements happen atomically in a Prisma transaction; out-of-stock attempts return HTTP 409.
- **Environment parsing**: `src/lib/env.ts` normalises Postgres variables, interpolates `${POSTGRES_*}` placeholders, and enforces a next-auth secret in production.

## File Map

- `src/app/app` – Authenticated routes: member dashboard + admin sections.
- `src/app/api` – REST endpoints (`/items`, `/items/:id/restock`, `/items/:id/writeoff`, `/consumptions`, `/admin/users`, `/me`).
- `src/components/items` & `src/components/inventory` – Client components for consumption and admin stock workflows.
- `src/lib` – Environment loader, currency formatter, Prisma client singleton.
- `prisma` – Schema, migrations, and `seed.ts` (demo users, allowlist domains, sample stock, opening ledger balance).

## Known Gaps & Next Steps

1. **Settlement operations** – Build server actions/API routes for draft → finalize → export, plus UI on `/app/settlements`.
2. **Ledger exports** – Implement CSV downloads and pagination for historical entries.
3. **Analytics & notifications** – Wire up popularity/low stock reports and SMTP-based reminder emails.
4. **Automated tests** – Extend Vitest coverage to API handlers and UI flows beyond the current unit suite.

Use this overview when planning new work: it clarifies which pieces are production-ready and which still rely on manual steps.
