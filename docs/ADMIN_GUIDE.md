# Lab Cafe Hub – Admin Operations Guide

This guide expands on the README for day-to-day stewardship of the lab cafe: managing access, inventory, settlements, and the ledger. Keep it close when you are wearing the “cafe treasurer” hat.

## 0. Quick Links

- [ONBOARDING.md](./ONBOARDING.md) – fresh install or new admin hand-off.
- [DB_OPERATIONS.md](./DB_OPERATIONS.md) – connecting with `psql`, running reports, backups.
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) – fastest fixes for common issues.

## 1. Access Control & Roles

### 1.1 Sign-in flow
- Members sign in at `http://<host>/app` using GitHub OAuth.
- Only emails/domains in the allowlist may complete sign-in. The allowlist is evaluated case-insensitively and supports both full emails and bare domains.

### 1.2 Managing the allowlist
There is not yet a dedicated UI; use Prisma Studio, `psql`, or an API call.

```sql
-- Allow any address at example.edu
INSERT INTO "AllowlistEntry" (id, value, note)
VALUES (gen_random_uuid(), 'example.edu', 'Graduate program cohort 2025');

-- Allow a specific email
INSERT INTO "AllowlistEntry" (id, value)
VALUES (gen_random_uuid(), 'alex@example.com');
```

Remove access by deleting the row or, for a temporary pause, archiving the user (see §1.4).

> Tip: the seed script whitelists `example.com` and `example.kr` for local testing. Replace these with your real domains before going live.

### 1.3 Promoting an admin
1. Ask the person to sign in once so a `User` row exists.
2. Run:
   ```sql
   UPDATE "User" SET role = 'ADMIN' WHERE email = 'new.admin@example.com';
   ```
3. Ask them to refresh `/app`; the navigation bar should now display **Inventory**, **Settlements**, and **Ledger** links.

Keep at least two active admins to avoid lockouts.

### 1.4 Archiving or reactivating members
- Set `isActive = false` to hide a user from member lists and block future sign-ins without deleting their history:
  ```sql
  UPDATE "User" SET "isActive" = false WHERE email = 'graduated@example.com';
  ```
- Re-enable by setting `isActive = true`.
- Archiving does **not** remove the open tab or settlement participation; they still appear in admin views for reconciliation.

## 2. Inventory Operations

### 2.1 Overview
Visit `/app/inventory` (admins only). The page lists items grouped by category and exposes **Restock** and **Write-off** drawers for each item. Data flows:
- Successful restocks create a `StockMovement` (`RESTOCK`) and optionally a `LedgerEntry` if you provide a unit cost.
- Write-offs record a `StockMovement` (`WRITE_OFF`), clamp stock atomically, and can post a `LedgerEntry` loss when “Record in ledger” is checked.

### 2.2 Adding a new item
Use the API (or Prisma Studio) until the inline form ships:
```bash
curl -X POST http://localhost:3000/api/items \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=<admin-session>" \
  -d '{
    "name": "Matcha Latte",
    "priceCents": 450,
    "category": "Drinks",
    "unit": "bottle",
    "currentStock": 12,
    "lowStockThreshold": 4
  }'
```

### 2.3 Restocking best practices
1. Click **Restock** beneath an item.
2. Enter the quantity received; optionally add the **unit cost (minor units)** and a note.
3. Provide a ledger description if you want something other than the auto-generated text.
4. Submit – the UI refreshes the in-memory count and shows a confirmation banner.

> Include the unit cost when you want the ledger to reflect the cash outlay. The API multiplies `unitCostCents × quantity` and posts a `PURCHASE` entry.

### 2.4 Handling write-offs
1. Click **Write-off**.
2. Enter the quantity to discard and a short reason (e.g., “expired”, “spilled”).
3. Toggle **Record in ledger** if you want to recognise the loss; otherwise stock decreases without a financial entry.

Attempting to write off more than the current stock returns an error and leaves counts unchanged.

### 2.5 Price changes
Until inline editing lands, update price through Prisma or SQL:
```sql
UPDATE "Item"
SET "priceCents" = 400, "updatedAt" = NOW()
WHERE id = 'itm_123';

INSERT INTO "ItemPriceHistory" (id, "itemId", "priceCents", currency)
VALUES (gen_random_uuid(), 'itm_123', 400, 'KRW');
```
Always insert a matching `ItemPriceHistory` row so settlements remain auditable.

## 3. Settlements & Member Tabs

The `/app/settlements` page lists the ten most recent settlements with counts and statuses. Creation/finalisation flows are being built; in the interim:
- Draft a settlement by inserting into `Settlement` and `SettlementLine` using SQL or Prisma scripts.
- Associate consumptions by setting `settlementId` once you have confirmed totals.
- Record payments in `Payment` and mirror them in the ledger as `RECEIPT` entries.

See [SETTLEMENTS.md](../SETTLEMENTS.md) for the canonical lifecycle and business rules.

## 4. Ledger Maintenance

- `/app/ledger` shows the 50 most recent entries with running balances.
- Restocks and write-offs automatically add ledger entries when cost tracking is enabled.
- For ad-hoc adjustments, insert directly:
  ```sql
  INSERT INTO "LedgerEntry" (
    id, timestamp, description, "amountCents", category, "userId"
  ) VALUES (
    gen_random_uuid(), NOW(), 'Bank transfer settlement #12', 38000, 'RECEIPT', '<admin-id>'
  );
  ```
- Keeping `balanceAfterCents` up to date is optional; the UI handles nulls gracefully.

## 5. Analytics & Alerts

Automated analytics are in progress. Today you can:
- Query low stock items: `SELECT name, "currentStock", "lowStockThreshold" FROM "Item" WHERE "currentStock" <= "lowStockThreshold";`
- Compute popularity: `SELECT i.name, SUM(c.quantity) FROM "Consumption" c JOIN "Item" i ON c."itemId" = i.id GROUP BY i.name ORDER BY SUM(c.quantity) DESC;`
- Export consumptions or ledger data with `npm run prisma studio` or direct SQL for quick CSV output.

## 6. Backups & Disaster Recovery

- Snapshot with `pg_dump`:
  ```bash
  docker compose exec db pg_dump \
    -U ${POSTGRES_USER:-postgres} \
    -d ${POSTGRES_DB:-lab_cafe} \
    --no-owner --no-privileges -c > lab-cafe-backup.sql
  ```
- Restore:
  ```bash
  cat lab-cafe-backup.sql | docker compose exec -T db psql \
    -U ${POSTGRES_USER:-postgres} \
    -d ${POSTGRES_DB:-lab_cafe}
  ```
- For managed databases, use the provider’s snapshot tooling and rotate secrets when you restore into a new environment.

Maintain a simple runbook: who to contact, where backups live, and how to rebuild the stack (README §8 has the commands).

## 7. Admin Handover Checklist

1. Confirm at least two admins exist and both can load `/app/inventory`.
2. Export current settlements and ledger CSV for archival.
3. Review low stock report and pending purchase orders.
4. Document outstanding debts before closing a settlement.
5. Share the `.env` (minus secrets) and update OAuth callbacks if the domain changes.

Lab Cafe Hub should now feel routine: record stock movements promptly, close settlements on schedule, and keep the ledger balanced. Reach for the other docs when you need deeper dives.
