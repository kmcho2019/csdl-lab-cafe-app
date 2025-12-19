# Database Operations Guide

Lab Cafe Hub stores everything in PostgreSQL via Prisma. This guide shows how to connect, inspect the most important tables, and run safe maintenance tasks.

## 1. Connection Basics

### 1.1 From Docker Compose

If you are using the bundled stack (`docker compose up -d db`):

- Host: `${POSTGRES_HOST:-db}` (inside containers) or `localhost` (from the host machine)
- Port: `${POSTGRES_PORT:-5432}`
- Database: `${POSTGRES_DB:-lab_cafe}`
- Username: `${POSTGRES_USER:-postgres}`
- Password: `${POSTGRES_PASSWORD:-postgres}`

All values come from `.env` so customise them there if needed.

### 1.2 `psql`

```bash
# interactive shell from the host (WSL/mac/Linux)
psql postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD:-postgres}@localhost:${POSTGRES_PORT:-5432}/${POSTGRES_DB:-lab_cafe}
```

Inside `psql` you can list tables with `\dt` and describe columns with `\d+ "Item"`.

### 1.3 Prisma Studio

Launch a quick GUI in the browser:

```bash
docker compose run --rm web npx prisma studio
```

Studio respects the same `.env` values and is handy for small edits.

### 1.4 From a VS Code Dev Container

If you are developing inside the devcontainer (`.devcontainer/`):

- You generally won’t have the `docker` CLI available inside the container.
- Postgres is reachable from the app container at `db:5432` (using the same `POSTGRES_*` defaults).

Useful devcontainer-friendly tools:

```bash
# Apply schema (no docker needed)
npx prisma db push

# Prisma Studio (forward port 5555 in VS Code)
npx prisma studio --hostname 0.0.0.0 --port 5555
```

For DB resets and demo seeding in the devcontainer, see `docs/DEVCONTAINER.md`.

### 1.5 Baseline migrations for an existing database

Use this one-time flow when production already has tables but `prisma/migrations` is empty.

1. Align the Prisma schema with production (review the diff before committing):
   ```bash
   npx prisma db pull
   ```
2. Generate a baseline migration file without applying it:
   ```bash
   mkdir -p prisma/migrations/0000_baseline
   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0000_baseline/migration.sql
   ```
3. Mark the baseline as applied against production:
   ```bash
   npx prisma migrate resolve --applied 0000_baseline
   ```
4. Verify status, then rely on CI `prisma migrate deploy` for future changes:
   ```bash
   npx prisma migrate status
   ```

## 2. Everyday Queries

### 2.1 Allowlist entries

```sql
SELECT value, note, "createdAt"
FROM "AllowlistEntry"
ORDER BY "createdAt" DESC;
```

> Tip: day-to-day allowlist updates can be handled in the **People** admin page; use SQL when bulk importing domains or auditing data.

### 2.2 Promote, archive, or inspect users

```sql
-- Promote to admin
UPDATE "User" SET role = 'ADMIN' WHERE email = 'alex@example.com';

-- Archive without deleting history
UPDATE "User" SET "isActive" = false WHERE email = 'alumni@example.com';

-- View current tabs (unsettled amounts)
SELECT u.name, u.email, SUM(c."priceAtTxCents") AS open_tab
FROM "User" u
LEFT JOIN "Consumption" c ON c."userId" = u.id AND c."settlementId" IS NULL
GROUP BY u.id
ORDER BY open_tab DESC NULLS LAST;
```

> The admin UI exposes Promote/Freeze/Reactivate buttons; use SQL for bulk updates or scripted migrations.

### 2.3 Inventory snapshots

```sql
SELECT name,
       "currentStock",
       "lowStockThreshold",
       currency,
       "priceCents"
FROM "Item"
ORDER BY name;
```

Stock history lives in `StockMovement`:

```sql
SELECT sm."createdAt",
       i.name,
       sm.type,
       sm.quantity,
       sm."unitCostCents",
       u.email AS actor
FROM "StockMovement" sm
JOIN "Item" i ON sm."itemId" = i.id
LEFT JOIN "User" u ON sm."byUserId" = u.id
ORDER BY sm."createdAt" DESC
LIMIT 25;
```

### 2.4 Consumptions & tabs

```sql
SELECT c."createdAt",
       u.email,
       i.name,
       c.quantity,
       c."priceAtTxCents"
FROM "Consumption" c
JOIN "User" u ON c."userId" = u.id
JOIN "Item" i ON c."itemId" = i.id
ORDER BY c."createdAt" DESC
LIMIT 50;
```

### 2.5 Settlements & payments

```sql
SELECT s.number,
       s.status,
       s."startDate",
       s."endDate",
       l."totalCents"
FROM "Settlement" s
JOIN "SettlementLine" l ON l."settlementId" = s.id
ORDER BY s."startDate" DESC, l."totalCents" DESC;

SELECT p."createdAt",
       u.email,
       s.number,
       p."amountCents"
FROM "Payment" p
JOIN "User" u ON p."userId" = u.id
JOIN "Settlement" s ON p."settlementId" = s.id
ORDER BY p."createdAt" DESC;
```

### 2.6 Ledger balances

```sql
SELECT timestamp,
       description,
       "amountCents",
       "balanceAfterCents",
       category
FROM "LedgerEntry"
ORDER BY timestamp DESC
LIMIT 30;
```

### 2.7 Purchase orders (restocks)

```sql
SELECT po."createdAt",
       po."vendorName",
       po."purchaseChannel",
       po."totalCostCents",
       po."receiptPath",
       po."comment",
       po."miscCostCents",
       po."miscComment"
FROM "PurchaseOrder" po
ORDER BY po."createdAt" DESC
LIMIT 25;
```

Line items:

```sql
SELECT poi."createdAt",
       i.name,
       poi.quantity,
       poi."unitCostCents",
       po."vendorName"
FROM "PurchaseOrderItem" poi
JOIN "PurchaseOrder" po ON po.id = poi."purchaseOrderId"
JOIN "Item" i ON i.id = poi."itemId"
ORDER BY poi."createdAt" DESC
LIMIT 50;
```

## 3. Linking GitHub accounts after manual imports

The app will automatically link a GitHub OAuth sign-in to an existing `User` row when the GitHub email matches `User.email` (this is also how the **People** page works).

If you bulk-import users and the GitHub email does **not** match the imported address (or you want to pre-link ahead of time), link via GitHub numeric ID:

1. Look up the user id.
   ```sql
   SELECT id FROM "User" WHERE email = 'person@example.com';
   ```
2. Ask the user for their GitHub numeric id (from `https://api.github.com/users/<username>`).
3. Save it onto the user (so the next sign-in can link automatically):
   ```sql
   UPDATE "User"
   SET "githubId" = '<github-id-from-step-2>'
   WHERE email = 'person@example.com';
   ```
4. Optional: insert the Auth.js account link immediately (if you want the mapping in place before they sign in):
   ```sql
   INSERT INTO "Account" (
     id,
     "userId",
     provider,
     type,
     "providerAccountId"
   ) VALUES (
     gen_random_uuid(),
     '<user-id-from-step-1>',
     'github',
     'oauth',
     '<github-id-from-step-2>'
   );
   ```

## 4. Backups & Restores

### 4.1 Dumping the database

```bash
# plain SQL file
docker compose exec db pg_dump \
  -U ${POSTGRES_USER:-postgres} \
  -d ${POSTGRES_DB:-lab_cafe} \
  --no-owner --no-privileges -c > lab-cafe-backup.sql
```

Use `--format=c` for a compressed archive that can be restored selectively with `pg_restore`.

### 4.2 Restoring

```bash
cat lab-cafe-backup.sql | docker compose exec -T db psql \
  -U ${POSTGRES_USER:-postgres} \
  -d ${POSTGRES_DB:-lab_cafe}
```

Remember to restart the web container afterwards so Prisma picks up any schema changes.

## 5. Resetting the Database

For a clean slate in development:

```bash
docker compose down --volumes
rm -rf prisma/migrations
npx prisma migrate dev --name init
npm run db:seed
```

This drops the data volume, recreates migrations from `schema.prisma`, and reseeds the demo inventory + allowlist.

---

Use these snippets as building blocks for your own reports and scripts. When in doubt, work against a staging copy and take a backup before running destructive commands.
