# Lab Cafe Hub

A lightweight web app to manage a lab's snack/drink cafe: track inventory, record member consumption, run periodic settlements, and maintain an auditable ledger. Built to replace the “paper on the fridge + ad‑hoc Excel” workflow with something fast, transparent, and export‑friendly.

---

## 1) Problem & Goals

**Current workflow:** Members mark ticks on paper for snacks/drinks they take. Every 1–2 months an admin tallies marks into Excel, orders new stock, and requests reimbursement transfers. There is also a “common account” ledger for purchases and settlement receipts.

**Goals**
- **Automate tracking** of consumption and inventory (no double-entry, no manual counts except restock/adjust).  
- **Simplify settlements** (lock period, compute per-member totals, export CSV/Excel).  
- **Real-time transparency** (members see their tab and history any time).  
- **Admin controls** for items, prices, users, and ledger.  
- **Analytics** for popular items, low stock, write-offs.  
- **Safe & simple deployment** (Vercel or Docker).

---

## 2) Key Features

### Member
- GitHub OAuth sign-in (allowlisted emails / domain).
- Browse menu with price and live stock.
- One‑tap **“Take one”** (records consumption + decrements stock).
- See **current tab** and full history.
- See **past settlements** and what was owed/paid per period.

### Admin
- All member features.
- **Inventory:** add/edit items; restock; write-off (expiry/damage); price changes with history.
- **Users:** add/promote/demote; archive (freeze) leavers; email/domain allowlist.
- **Settlements:** preview → finalize → export CSV/Excel; optional email notices.
- **Ledger:** purchases (debits) and receipts (credits); running balance.
- **Orders:** optional purchase orders → receive stock → update ledger.
- **Reports:** popularity, least/most consumed, low stock alerts.
- **Data export:** transactions, settlements, and ledger as CSV/Excel.

---

## 3) Architecture Overview

- **Frontend/Backend:** Next.js (App Router) with API routes (or tRPC if preferred).  
- **Auth:** Auth.js (NextAuth) with GitHub provider + email/domain allowlist.  
- **DB:** PostgreSQL (recommended) with Prisma ORM. SQLite acceptable for local single‑user dev.  
- **UI:** Tailwind CSS + shadcn/ui components.  
- **Deploy:** Vercel (serverless) *or* Docker Compose (web + Postgres).  
- **Background jobs:** Vercel Cron (or container cron) for low‑stock checks and email notices.

### Repo layout

- `src/app` — Next.js routes (`/` marketing, `/app` authenticated workspace, `/api` handlers).
- `src/components` — Shared UI including inventory manager and item grid.
- `src/server` — Auth guards, NextAuth options, Prisma client.
- `prisma/` — Schema + seed script.
- `docker-compose.yml` — (optional) Postgres for local dev.

### High-Level Flow
```
Browser ──(OAuth via GitHub)──> Next.js ── Prisma ──> Postgres
   ▲                                           │
   └───── CSV/Excel exports <──── API ─────────┘
```

---

## 4) Data Model (summary)

> See `DB_SCHEMA.prisma` for full schema.

- **User**: role (`MEMBER`/`ADMIN`), isActive, email, githubId.
- **AllowlistEntry**: explicit emails or domains permitted to sign in.
- **Item**: name, category, price (minor units), currentStock, lowStockThreshold, active.
- **ItemPriceHistory**: snapshots for auditing and settlement calculations.
- **Consumption**: member takes item; immutable priceAtTx + quantity; optional settlementId.
- **StockMovement**: RESTOCK / WRITE_OFF / ADJUST / CONSUME (system) for auditability.
- **Settlement**: period with status (DRAFT, FINALIZED, VOID); summary totals.
- **SettlementLine**: per-user totals cached at finalize time for export speed.
- **LedgerEntry**: single‑entry ledger (+credit / –debit) with categories.
- **Payment**: settlement payments recorded against users.
- **PurchaseOrder & PurchaseOrderItem**: optional vendor/order tracking.
- **AuditLog**: who did what, when, from where (ip).

**Stock model:** `currentStock` is derived from movements, but persisted for speed; consistency verified periodically.

---

## 5) Core Flows

### Record consumption
1. Member taps **Take** on an item.
2. Validate stock > 0; create `Consumption` with `priceAtTx` = current item price.
3. Create `StockMovement(type=CONSUME, qty=1)`; decrement `Item.currentStock` atomically.
4. Update member tab view.

### Restock
1. Admin clicks **Restock** on item, enters quantity and total cost (or unit cost).
2. Create `PurchaseOrder` (optional) and `StockMovement(RESTOCK)`.
3. Ledger: add **debit** for purchase.
4. Increase `Item.currentStock` atomically.

### Write-off (expiry/damage)
- Admin records `WRITE_OFF` movement with reason (note). Stock decreases; optional **debit** in ledger (if you want to recognize as loss).

### Settlement
1. Admin **creates DRAFT**: choose date range (default last period).
2. System assembles per-user totals and preview.
3. Admin **FINALIZEs**: locks in included `Consumption` rows (assigns settlementId).
4. System writes `SettlementLine` summaries and generates exports. Optional email notifications.
5. Admin marks payments as received (ledger **credits**).

---

## 6) Security & Compliance (quick view)

- OAuth via GitHub; only allowlisted emails/domains can complete sign‑in.
- HTTPS everywhere; secure cookies; CSRF enabled; session rotation on privilege change.
- RBAC at route + data layer; admins only for mutations that affect others.
- Audit log for admin actions and stock/price changes.
- Minimal PII (name, email). Backups encrypted at rest if stored.
- Rate limiting for write endpoints; double‑submit protection on “Take one”.

See `SECURITY.md` for details.

---

## 7) Exports

- **Settlement CSV/Excel** (per user: item count, amount, bank-memo string).
- **Transaction CSV** (timestamp, member, item, priceAtTx, quantity, settlementId).
- **Ledger CSV** (date, description, debit, credit, running balance).
- All exports are idempotent and labeled with ISO dates (e.g., `settlement_2025-01-01__2025-02-28.csv`).

---

## 8) Getting Started

### Prerequisites
- Node.js 18+
- Docker (for local Postgres) or access to a Postgres DB
- GitHub OAuth app (client id/secret)

### Local (Docker or direct Postgres)
1. `cp .env.example .env`
2. Provision a Postgres instance (`docker compose up -d db` or use cloud Postgres).
3. `npm install`
4. `npm run prisma:migrate` (creates migrations + schema)
5. `npm run prisma:generate`
6. (optional) `npx prisma db seed`
7. `npm run dev` → http://localhost:3000

The app boots with:
- **App router** Next.js 14 + React Server Components.
- **Auth.js (NextAuth)** backed by Prisma adapter and GitHub OAuth.
- **Prisma Client** with the schema in `prisma/schema.prisma`.
- **React Query** on the client for optimistic actions (e.g., “Take one”).

### Deploy to Vercel
1. Create project and add environment variables from `.env.example`.
2. Add a Postgres (Vercel Postgres / Supabase / Neon). Set `DATABASE_URL`.
3. Configure **GitHub OAuth** callback: `${NEXTAUTH_URL}/api/auth/callback/github`.
4. Set Vercel Cron for periodic jobs (optional).

---

## 9) Configuration

Key environment variables (see `.env.example` for all):
- `DATABASE_URL` – Postgres connection string
- `NEXTAUTH_URL` – app base URL
- `NEXTAUTH_SECRET` – random 32+ char secret
- `GITHUB_ID`, `GITHUB_SECRET` – OAuth creds
- `ALLOWLIST_DOMAINS` – comma-separated domains (e.g., `uni.edu,other.edu`)
- `SMTP_*` – for email notifications
- `APP_CURRENCY` – e.g., `USD`, `EUR`, `JPY`

---

## 10) Roadmap / Nice-to-haves

- Kiosk/PWA mode (large buttons, offline queue with replay).
- Barcode/QR scan to “take” or restock items.
- Stripe/PayPal integration (optional) — current default is manual bank transfer + mark as paid.
- Webhooks (notify Slack on low-stock / settlement created).
- Multi‑lab / multi‑location support (scoped inventories).

---

## 11) Contributing

- Conventional commits, ESLint/Prettier, type‑safe Prisma.
- Tests: unit (Vitest) + e2e (Playwright). Seed fixtures for deterministic runs.

---

## 12) Appendix: Terminology

- **Debit**: money **out** of the cafe account (e.g., stock purchase, write‑off).
- **Credit**: money **in** (e.g., member settlement payment).
- **PriceAtTx**: immutable price captured when a member took the item.
- **Write‑off**: inventory reduction not tied to consumption (expiry/loss).
