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
- If a matching `User` row already exists (seeded/imported/created via **People**), the first successful GitHub sign-in will automatically link the OAuth `Account` to that existing user.

### 1.2 Managing the allowlist
- Visit **People** (`/app/users`).
- Fill in the **Add lab member** form with the member’s name, email, and optional GitHub ID.
- Submit – the address is saved to the allowlist and a `User` row is created.
- You can still record allowlist entries manually through SQL/Prisma when bulk importing; the UI will display them automatically once a matching `User` exists.

> Tip: the seed script whitelists `example.com` and `example.kr` for local testing. Replace these with your real domains before going live.

### 1.3 Promoting an admin
1. Open **People** and locate the member.
2. Click **Promote to admin**. The button toggles to **Set as member** once the update succeeds.
3. Ask them to refresh `/app`; a promoted admin gains access to **Inventory**, **People**, **Ledger**, and **Settlements**.

Keep at least two active admins to avoid lockouts—the UI prevents demoting or freezing the final active admin.

### 1.4 Archiving or reactivating members
- Click **Freeze account** in the People table to deactivate a user (blocks sign-in but keeps history).
- Click **Reactivate** to restore access.
- The UI will not let you freeze yourself if you are the last active admin.

## 2. Inventory Operations

### 2.1 Overview
Visit `/app/inventory` (admins only). The page lists items grouped by category and exposes **Restock** and **Write-off** drawers for each item. Data flows:
- Successful restocks create a `StockMovement` (`RESTOCK`) and optionally a `LedgerEntry` if you provide a unit cost.
- Write-offs record a `StockMovement` (`WRITE_OFF`), clamp stock atomically, and can post a `LedgerEntry` loss when “Record in ledger” is checked.

### 2.2 Adding a new item
- Open `/app/inventory` and use the **Add new item** form at the top of the page.
- Provide the name, price in minor units (e.g., KRW), optional category/unit, and initial stock.
- On submit the system creates the `Item`, records price history, and posts an initial `RESTOCK` movement for any starting inventory.

### 2.3 Editing an item
- Expand **Edit** on the item card.
- Adjust the name, price (minor units), unit, or low-stock threshold.
- Choose a category from the dropdown or pick **Add new category…** to define a fresh category on the fly.
- Saving updates the record immediately and, when the price changes, logs a new `ItemPriceHistory` row so settlements stay accurate.

### 2.4 Restocking best practices
1. Click **Restock** beneath an item.
2. Enter the quantity received; optionally add the **unit cost (minor units)** and a note.
3. Provide a ledger description if you want something other than the auto-generated text.
4. Submit – the UI refreshes the in-memory count and shows a confirmation banner.

> Include the unit cost when you want the ledger to reflect the cash outlay. The API multiplies `unitCostCents × quantity` and posts a `PURCHASE` entry.

### 2.5 Handling write-offs
1. Click **Write-off**.
2. Enter the quantity to discard and a short reason (e.g., “expired”, “spilled”).
3. Toggle **Record in ledger** if you want to recognise the loss; otherwise stock decreases without a financial entry.

Attempting to write off more than the current stock returns an error and leaves counts unchanged.

## 3. Settlements & Member Tabs

Settlements are how you close a period, lock the included consumptions, and export a per-member billing file.

### 3.1 Monthly workflow (recommended)
1. Visit `/app/settlements`.
2. Create a **draft** for the month you want to bill.
3. Download the **preview CSV** to sanity-check totals without locking anything.
4. Click **Finalize** once you are ready to close the month. This assigns `settlementId` to eligible consumptions and writes per-user `SettlementLine` rollups.
5. Download the finalized CSV and share it with members (or your finance tracker).

### 3.2 Notes
- Draft exports are previews: they include consumptions in the range that still have `settlementId = NULL`.
- Finalized exports are stable: they read from `SettlementLine` and stay unchanged even if item prices change later.

See [SETTLEMENTS.md](../SETTLEMENTS.md) for lifecycle rules and correction guidance.

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

Visit `/app/analytics` to see:
- **Popularity** rankings over the selected time window.
- **Stock trend** sparklines per item with low/out-of-stock highlighting.

For deeper or custom reports you can still use SQL, for example:
- Low stock items: `SELECT name, "currentStock", "lowStockThreshold" FROM "Item" WHERE "currentStock" <= "lowStockThreshold";`
- Popularity: `SELECT i.name, SUM(c.quantity) FROM "Consumption" c JOIN "Item" i ON c."itemId" = i.id GROUP BY i.name ORDER BY SUM(c.quantity) DESC;`

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

## 8. Kiosk Mode

- `/app/kiosk` offers a tablet-ready interface. Tap items to add them to the cart, then press **Record purchase** to post the consumptions and stock movements in one go.
- **Members** can use kiosk mode, but can only charge items to their own tab.
- **Admins** can select any active member from the dropdown (useful on shared tablets).
- The cart respects realtime stock counts and returns an error if items are out of stock.
- Clear the cart between visits with the **Clear cart** button.
