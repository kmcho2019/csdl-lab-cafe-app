# AGENTS.md — Actors & Responsibilities

This document defines **who** (or what) performs which responsibilities in the system. “Agents” includes both **human roles** and **automation services**.

---

## 1) Human Roles

### Member
- Authenticate via GitHub (must pass allowlist).
- View menu with price & live stock.
- Record consumption (“Take one”, optionally quantity > 1).
- Review current tab and full history.
- View past settlements and what was owed/paid.

### Admin
- All Member privileges.
- Manage **users** (add/promote/demote/archive; manage allowlist).
- Manage **inventory** (create/edit items, price changes, restock, write‑offs).
- Run **settlements** (preview → finalize → export → notify).
- Maintain **ledger** (purchases, receipts, adjustments).
- Review **analytics** (popularity, low stock).

---

## 2) System Agents (Automation)

### 2.1 Auth Agent
- Handles OAuth handshakes (GitHub via Auth.js).
- Enforces email/domain allowlist before creating a User.
- Maintains sessions; rotates on role changes; revokes archived users.

### 2.2 Inventory Agent
- Single source of truth for stock counts (creates `StockMovement` rows).
- Validates non-negative stock and prevents oversell (unless admin override).
- Emits low-stock events when `currentStock <= lowStockThreshold`.

### 2.3 Settlement Agent
- Draft → preview → finalize workflow.
- Freezes eligible `Consumption` rows by assigning `settlementId`.
- Writes `SettlementLine` rollups and generates export files.
- Optionally queues **Notification Agent** emails to members.
- Supports **void** and **re-open** (admin-only; full audit trail).

### 2.4 Ledger Agent
- Persists all cash movements:
  - **Debits**: purchase orders, write-offs (optional), refunds.
  - **Credits**: member payments, adjustments.
- Maintains running balance (snapshot stored each entry for quick views).

### 2.5 Ordering Agent (optional)
- Creates `PurchaseOrder` with one or more item lines.
- On **receive**, posts `RESTOCK` movements and ledger **debit** (cost).

### 2.6 Analytics Agent
- Aggregates popularity metrics (consumptions per item over time windows).
- Surfaces “dead stock” (no movement in N days), price elasticity insights.

### 2.7 Notification Agent
- Sends email (SMTP) and/or Slack webhooks.
- Templates: low-stock, settlement finalized, payment reminders.
- Retries with backoff; writes `Notification` log with status/error.

---

## 3) RACI Matrix (high-level)

| Task | Member | Admin | Auth Agent | Inventory Agent | Settlement Agent | Ledger Agent | Notification Agent | Ordering Agent |
|---|---|---|---|---|---|---|---|---|
| Sign in | R | A | C |  |  |  |  |  |
| Record consumption | R | A |  | C |  |  |  |  |
| Restock items |  | R |  | C |  | C |  | C |
| Write-off items |  | R |  | C |  | C |  |  |
| Run settlement |  | R |  |  | C | C | C |  |
| Export data |  | R |  |  | C | C |  |  |
| Manage users |  | R | C |  |  |  |  |  |
| Create purchase order |  | R |  |  |  | C |  | C |
| Send notifications |  | A |  |  |  |  | R |  |

*R = Responsible, A = Accountable, C = Consulted.*

---

## 4) Canonical Flows (sequence)

### 4.1 Member takes an item
```
Member → UI: click "Take one"
UI → API: POST /api/consumptions { itemId, qty }
API → Inventory Agent:
    - Check stock > 0
    - Create Consumption(priceAtTx = Item.price)
    - Create StockMovement(CONSUME, qty)
    - Decrement Item.currentStock atomically
API → UI: 200 OK { newTabTotal, newStock }
```

### 4.2 Admin restocks
```
Admin → UI: Restock item
UI → API: POST /api/items/:id/restock { qty, unitCost }
API:
    - Create PurchaseOrder (optional)
    - Create StockMovement(RESTOCK, qty)
    - Increment Item.currentStock
    - LedgerAgent: add debit (qty * unitCost)
UI: show updated stock and ledger balance
```

### 4.3 Settlement finalize
```
Admin → UI: Create DRAFT (date range)
SettlementAgent:
    - Aggregate un-settled Consumptions in range
    - Build preview per user
Admin → UI: FINALIZE
SettlementAgent:
    - Assign settlementId to included Consumptions
    - Persist Settlement + SettlementLines
    - Generate CSV/Excel
NotificationAgent: email each member (optional)
```

### 4.4 Write-off
```
Admin → UI: Write-off { qty, reason }
InventoryAgent:
    - Create StockMovement(WRITE_OFF, qty, note=reason)
    - Decrement Item.currentStock
LedgerAgent (optional): debit "Loss/Write-off"
```

---

## 5) Failure & Edge Cases

- **Race on “Take one”:** Use DB transaction & `SELECT … FOR UPDATE` or optimistic concurrency (version column). Return 409 if stock exhausted.
- **Price change mid-period:** Price at time of consumption is immutable (`priceAtTx`), so settlements remain accurate.
- **Archive user with unpaid tab:** User is `isActive=false` but account remains visible to admins; they can still be included in settlement. Prevent future sign-ins.
- **Negative stock discovered:** Use `ADJUST` movement to reconcile; leave audit note.
- **Mis-click:** Allow member self-reversal within X minutes (e.g., 2 mins) if stock still available, recorded as compensating `ADJUST + reverse Consumption` (audit logged).

---

## 6) SLAs / SLOs (internal)

- 99.9% monthly availability (serverless recommended).
- UI actions < 200 ms p95 (excluding cold starts).
- Export generation < 5 s for 10k rows.

---

## 7) Open Questions (track as issues)

- Do we enforce **single unit** per item, or support fractional quantities (e.g., coffee beans by weight)?
- Multiple currencies? (Default single currency via `APP_CURRENCY`.)
- Tax handling needed? (Default: no tax calculus; prices are tax‑inclusive.)

