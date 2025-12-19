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
Visit `/app/inventory` (admins only). The page lists items grouped by category and exposes **Edit**, **Write-off**, and **Archive/Reactivate** actions.

For day-to-day purchasing, use **Restocks** (`/app/restocks`) to record a multi-item purchase in one place (stock movements + ledger outflow + receipt metadata). The per-item restock drawer remains available for quick one-off top-ups, but the centralized restock flow is recommended for clean accounting.

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
**Recommended (multi-item, ledger-accurate):**
1. Visit `/app/restocks`.
2. Fill in vendor/channel, optional receipt path + comment, and add one or more item lines (qty + unit cost).
3. Add optional misc costs (shipping/fees) with a short comment.
4. Submit – the system:
   - Creates a `PurchaseOrder` (stored as received).
   - Posts `StockMovement(type=RESTOCK)` per item line.
   - Posts a `LedgerEntry(category=PURCHASE)` debit for the full cost (lines + misc).

**Quick single-item top-up (fallback):**
1. On `/app/inventory`, expand **Restock** for an item.
2. Enter quantity and (optionally) unit cost.
3. Submit – a `StockMovement(RESTOCK)` is created and a ledger debit is recorded if a unit cost is supplied.

> Include the unit cost when you want the ledger to reflect the cash outlay. The API multiplies `unitCostCents × quantity` and posts a `PURCHASE` entry.

### 2.5 Handling write-offs
1. Click **Write-off**.
2. Enter the quantity to discard and a short reason (e.g., “expired”, “spilled”).
3. Toggle **Record in ledger** if you want to recognise the loss; otherwise stock decreases without a financial entry.

Attempting to write off more than the current stock returns an error and leaves counts unchanged.

### 2.6 Archiving (phasing out) an item
Instead of deleting menu items, Lab Cafe Hub supports **archiving**. Archived items are:
- Hidden from members (not shown on `/app`) and kiosk checkout.
- Kept in a collapsed **Archived items** section on `/app/inventory` for admins.
- Reactivatable at any time.

Safety rules:
- You can only archive an item when its stock is **exactly 0**.
- The UI requires typing the **exact item name** before the Archive button becomes enabled.

Workflow:
1. If the item has remaining stock, record a **Write-off** until stock reaches 0.
2. Expand **Archive** on the item card and type the item name to confirm.
3. The item moves to the **Archived items** section and becomes unavailable to members.
4. To bring it back, open **Archived items** (collapsed by default) and click **Reactivate**.

Audit trail: archiving and reactivating create `AuditLog` rows (`ITEM_ARCHIVED`, `ITEM_REACTIVATED`).

## 3. Settlements & Member Tabs

Settlements are how you close a period, lock the included consumptions, and export a per-member billing file.

### 3.1 Monthly workflow (recommended)
1. Visit `/app/settlements`.
2. Create a **draft** for the month you want to bill.
3. Expand **Preview bills** to review per-member totals and totals-by-item in the UI.
4. (Optional) Expand **Corrections** to reverse mistaken transactions before billing is locked.
5. Download the **preview CSV** to sanity-check totals without locking anything.
6. Click **Finalize bills** once you are ready to lock the month. This:
   - Assigns `settlementId` to eligible consumptions.
   - Writes per-user `SettlementLine` rollups.
   - Moves the settlement to **BILLED**.
7. Expand **Payment tracking** and mark each member paid as transfers arrive.
8. When everyone is paid, click **Finalize settlement**. This:
   - Moves the settlement to **FINALIZED**.
   - Credits the ledger with a single `SETTLEMENT` entry for the settlement total.
9. Download the billed/finalized CSV for your records.

### 3.2 Notes
- Draft exports are previews: they include consumptions in the range that still have `settlementId = NULL`.
- Finalized exports are stable: they read from `SettlementLine` and stay unchanged even if item prices change later.

See [SETTLEMENTS.md](../SETTLEMENTS.md) for lifecycle rules and correction guidance.

### 3.3 Reversing accidental transactions (corrections)
Lab Cafe Hub supports reversing mistaken consumptions (mis-clicks, wrong member selected, etc.).

Rules:
- **Members** can only reverse their own transactions.
- **Admins** can reverse transactions for any user (use the draft settlement **Corrections** panel).
- Reversals are only allowed while the transaction is **unbilled** (`settlementId = NULL`). Once bills are finalized (**BILLED**), included transactions cannot be changed.
- An optional note (max 200 chars, Unicode ok; control characters blocked) can be added for audit context.

What happens on reversal:
- `Consumption.reversedAt` is set (so exports/settlements ignore it).
- Stock is restored via `StockMovement(type=ADJUST, qty=...)`.
- An `AuditLog` entry is created (`CONSUMPTION_REVERSED`).

### 3.4 Transaction history (admin audit)
Visit `/app/transactions` to review consumption activity across all members. The page supports:
- Time window filters (From/To).
- Pagination (“Load more”) for long histories.
- Including or hiding reversed transactions.

Use this view to audit stock changes and investigate disputes before billing is finalized.

### 3.5 Period overview (between settlements)
Visit `/app/overview` for a live summary of all unsettled consumptions (totals by item + by member). This view “resets” when a settlement bills the period, because billed consumptions receive a `settlementId`.

### 3.6 Member reports
From **People** (`/app/users`), click **Report** on a member to view:
- Their current unsettled tab (transaction count, item count, expected bill).
- Their last 12 billed periods with per-item breakdown.

## 4. Ledger Maintenance

- `/app/ledger` includes:
  - An **Account balance** dashboard (sparkline over time + current balance).
  - An **Adjust balance** form for opening balances, donations, and manual corrections (Unicode description, max 200 chars; control characters blocked).
  - A table of recent entries.
- Restocks and write-offs add ledger entries when cost tracking is enabled.
- Settlements credit the ledger only when the settlement is fully **FINALIZED** (after all members are marked paid).

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
2. Export current settlements and take a ledger snapshot (UI table or `pg_dump`) for archival.
3. Review low stock report and recent restocks.
4. Document outstanding debts before closing a settlement.
5. Share the `.env` (minus secrets) and update OAuth callbacks if the domain changes.

Lab Cafe Hub should now feel routine: record stock movements promptly, close settlements on schedule, and keep the ledger balanced. Reach for the other docs when you need deeper dives.

## 8. Kiosk Mode

- `/app/kiosk` offers a tablet-ready interface. Tap items to add them to the cart, then press **Record purchase** to post the consumptions and stock movements in one go.
- **Members** can use kiosk mode, but can only charge items to their own tab.
- **Admins** can select any active member from the dropdown (useful on shared tablets).
- The cart respects realtime stock counts and returns an error if items are out of stock.
- Clear the cart between visits with the **Clear cart** button.
