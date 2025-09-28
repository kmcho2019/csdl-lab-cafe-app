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

## 2. Everyday Queries

### 2.1 Allowlist entries

```sql
SELECT value, note, "createdAt"
FROM "AllowlistEntry"
ORDER BY "createdAt" DESC;
```

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

## 3. Linking GitHub accounts after manual imports

If you bulk-import users and want GitHub SSO to hit the existing row rather than creating a duplicate:

1. Look up the user id.
   ```sql
   SELECT id FROM "User" WHERE email = 'person@example.com';
   ```
2. Ask the user for their GitHub numeric id (from `https://api.github.com/users/<username>`).
3. Insert the Auth.js account link:
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
