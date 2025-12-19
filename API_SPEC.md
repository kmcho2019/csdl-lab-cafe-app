# API_SPEC.md

> REST-ish API shape (can also be implemented with tRPC). All endpoints require auth; admin-only endpoints are noted.

Base URL: `/api`

## Auth (Auth.js — handled by library)
- `GET /api/auth/*` — OAuth callbacks, session, CSRF, etc.

## Users
- `GET /admin/users` **(admin)** — list users with role/isActive metadata.
- `POST /admin/users` **(admin)** — create member (name, email, optional GitHub ID, optional admin role). Auto-allowlists the email.
- `PATCH /admin/users/:id` **(admin)** — update role, `isActive`, email, or GitHub ID.
- `GET /me` — current user profile.

### Example
```http
PATCH /api/admin/users/clxy123
{ "role": "ADMIN", "isActive": true }
```

## Allowlist
- Managed implicitly when creating users. Use Prisma Studio/SQL for bulk domain imports.

## Items
- `GET /items?active=true`
- `POST /items` **(admin)**
- `PATCH /items/:id` **(admin)** — update name, price, category, unit, or low-stock threshold.
- `POST /items/:id/restock` **(admin)** — `{ quantity, unitCostCents?, note?, ledgerDescription? }`
- `POST /items/:id/writeoff` **(admin)** — `{ quantity, reason?, recordLedger?, ledgerDescription? }`
- `POST /items/:id/archive` **(admin)** — `{ confirmName }` (requires `currentStock = 0`)
- `POST /items/:id/reactivate` **(admin)**

## Kiosk
- `POST /kiosk/checkout` — `{ userId, cart: [{ itemId, quantity }] }`
  - **Admins** may charge any active member.
  - **Members** may only charge themselves (server-enforced).

## Consumption
- `POST /consumptions` — `{ itemId, quantity=1 }`
- `GET /consumptions?limit=25&includeReversed=true&includeSettled=false` — lists your recent consumptions.
- `POST /consumptions/:id/reverse` — `{ note? }` (Unicode ok, max 200 chars; control chars rejected). Requires `settlementId = NULL`.

### Example
```http
POST /api/consumptions
{ "itemId": "it_123", "quantity": 1 }
→ 200 { "consumption": { "id": "tx_456", "priceAtTxCents": 150, "currency": "USD" }, "newStock": 11 }
```

## Settlements
- `GET /settlements` **(admin)** — list recent settlements.
- `POST /settlements` **(admin)** — `{ month: "YYYY-MM", notes? }` → DRAFT
- `GET /settlements/:id/preview` **(admin)** — draft-only UI preview (per-member totals + totals-by-item).
- `POST /settlements/:id/finalize` **(admin)** — **finalize bills** (`DRAFT → BILLED`):
  - assigns `settlementId` to eligible consumptions
  - writes `SettlementLine` rollups for stable exports
- `GET /settlements/:id/payments` **(admin)** — billed payment summary (due/paid per member).
- `POST /settlements/:id/payments` **(admin)** — toggle paid/unpaid:
  - `{ userId, isPaid, method?, reference? }`
  - `reference` is Unicode ok, max 200 chars; control chars rejected.
- `POST /settlements/:id/complete` **(admin)** — **finalize settlement** (`BILLED → FINALIZED`):
  - requires all members paid
  - creates a `LedgerEntry(category=SETTLEMENT)` credit for the settlement total
- `GET /settlements/:id/export?format=csv` **(admin)** — per-member accounting export (drafts export a preview; billed/finalized export from rollups).
- `GET /settlements/:id/consumptions?limit=50&includeReversed=true` **(admin)** — list unsettled consumptions in the settlement window (used for draft corrections).

## Admin transaction history
- `GET /admin/transactions?limit=50&cursor=<id>&from=<iso>&to=<iso>&includeReversed=true` **(admin)** — paginated cross-member consumption history.

## Ledger
- `GET /ledger` **(admin)** — list entries (with running balance).
- `POST /ledger` **(admin)** — manual entry `{ timestamp?, description, amountCents, category }`
  - `description` is Unicode ok, max 200 chars; control chars rejected.
- `GET /ledger/summary?window=7d|30d|90d` **(admin)** — running balance series for charts.

## Reports
- `GET /reports/low-stock` **(admin)**
- `GET /reports/popularity?window=30d` **(admin)**

## Purchase Orders / Restocks
- `GET /purchase-orders?limit=20&cursor=<id>` **(admin)** — list recent purchase orders.
- `POST /purchase-orders` **(admin)** — record a received restock with one or more lines:
  - `{ vendorName, purchaseChannel?, receiptPath?, comment?, miscCostCents?, miscComment?, lines: [{ itemId, quantity, unitCostCents }] }`
  - `comment`, `receiptPath`, and `miscComment` accept Unicode (max length enforced; control chars rejected).
  - Creates `PurchaseOrder`, `StockMovement(RESTOCK)` rows, and a `LedgerEntry(category=PURCHASE)` debit.

## Errors
- Use standard HTTP codes. JSON:
```json
{ "error": { "code": "OUT_OF_STOCK", "message": "Not enough stock." } }
```
