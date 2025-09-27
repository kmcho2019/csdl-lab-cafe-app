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
- Names and receipts render in any language (Korean verified) with locale-aware currency formatting.

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
- Node.js 20+
- Docker (for local Postgres) or access to a Postgres DB
- GitHub OAuth app (client id/secret)

### Local development

#### Option A – Docker Compose (everything in containers)
1. Install Docker Desktop or Docker Engine + Compose plugin.
2. Copy env defaults: `cp .env.example .env`.
3. Edit `.env` and set (the sample already points the database host at the `db` service):
   - `NEXTAUTH_SECRET` to a random 32+ char string.
   - `GITHUB_ID` / `GITHUB_SECRET` once your OAuth app is ready.
   - (optional) tweak `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, or `POSTGRES_HOST`; when you do, update `DATABASE_URL` to match.
4. Start Postgres: `docker compose up -d db` (wait for "healthy" status).
5. Install dependencies in the web container: `docker compose run --rm web npm install`.
6. Apply the Prisma schema: `docker compose run --rm web npx prisma db push`.
7. Seed demo data (optional): `docker compose run --rm web npx prisma db seed`.
8. Launch the app: `docker compose up web` (or `docker compose up` for both services). Visit http://localhost:3000.
9. Stop containers with `docker compose down` when finished.

> **Prisma runtime note:** The Prisma client now ships both `linux-musl-openssl-3.0.x` and `debian-openssl-3.0.x` engines so the local Node process and the Debian-based web container agree on the runtime. After pulling schema changes, run `npm run prisma:generate` (or `docker compose run --rm web npm run prisma:generate`) to refresh the engines. If Prisma still reports `libssl.so.3` missing, rebuild the web image with `docker compose build --no-cache web` and recreate the `web_node_modules` volume (`docker compose down --volumes`).

Common dockerised workflows:
- Run linting: `docker compose run --rm web npm run lint`
- Run unit tests: `docker compose run --rm web npm run test`
- Open Prisma Studio: `docker compose run --rm --service-ports web npx prisma studio`
- Tail logs: `docker compose logs -f web`

#### Option B – Local Node.js with Docker Postgres
1. Install Node.js 20+ and Docker.
2. `cp .env.example .env` and set `POSTGRES_HOST=localhost` (update `DATABASE_URL` to match if you change the user/password/db name).
3. Start Postgres: `docker compose up -d db`.
4. `npm install`
5. `npm run prisma:migrate` (or `npx prisma db push` during prototyping)
6. (optional) `npx prisma db seed`
7. `npm run dev` and open http://localhost:3000
8. `npm run test` (and `npm run lint`) keep the project healthy


#### Option C – VS Code Dev Container
1. Install Docker and the VS Code Dev Containers extension.
2. Open this repository in VS Code and run `Dev Containers: Reopen in Container`.
3. Wait for the build to finish; the container runs `npm install` and `npm run prisma:generate` automatically.
4. Run `npm run prisma:migrate` (or `npm run db:push`) inside the container to sync the schema.
5. Start the dev server with `npm run dev` and browse at http://localhost:3000.
6. Use `npm run lint` and `npm run test` for quick checks; Postgres is reachable at `postgresql://postgres:postgres@db:5432/lab_cafe`.

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
- `DATABASE_URL` – Postgres connection string (Compose rebuilds this from the `POSTGRES_*` knobs)
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_HOST`, `POSTGRES_PORT` – canonical database settings used by Docker and local tooling
- `NEXTAUTH_URL` – app base URL
- `NEXTAUTH_SECRET` – random 32+ char secret
- `GITHUB_ID`, `GITHUB_SECRET` – OAuth creds
- `ALLOWLIST_DOMAINS` – comma-separated domains (e.g., `uni.edu,other.edu`)
- `SMTP_*` – for email notifications
- `APP_CURRENCY` – e.g., `USD`, `EUR`, `KRW`; store prices in minor units (won have no decimals).
- `APP_LOCALE` – e.g., `en-US`, `ko-KR`; drives per-user number/currency formatting.

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
