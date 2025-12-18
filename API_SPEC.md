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
- `POST /consumptions/:id/reverse` — `{ note? }` (ASCII, max 200 chars). Requires `settlementId = NULL`.

### Example
```http
POST /api/consumptions
{ "itemId": "it_123", "quantity": 1 }
→ 200 { "consumption": { "id": "tx_456", "priceAtTxCents": 150, "currency": "USD" }, "newStock": 11 }
```

## Settlements
- `GET /settlements` **(admin)** — list recent settlements.
- `POST /settlements` **(admin)** — `{ month: "YYYY-MM", notes? }` → DRAFT
- `POST /settlements/:id/finalize` **(admin)** — locks eligible consumptions and writes `SettlementLine` rollups.
- `GET /settlements/:id/export?format=csv` **(admin)** — per-member monthly accounting export (drafts export a preview).
- `GET /settlements/:id/consumptions?limit=50&includeReversed=true` **(admin)** — list unsettled consumptions in the settlement window (used for draft corrections).
- (Planned) `POST /settlements/:id/void`, `POST /settlements/:id/payments`, and detailed preview endpoints.

## Ledger
- `GET /ledger` **(admin)** — list entries (with running balance).
- `POST /ledger` **(admin)** — arbitrary entry `{ timestamp, description, amountCents, category }`

## Reports
- `GET /reports/low-stock` **(admin)**
- `GET /reports/popularity?window=30d` **(admin)**

## Purchase Orders (optional)
- `POST /purchase-orders` **(admin)** — create order with lines
- `GET /purchase-orders` **(admin)**
- `POST /purchase-orders/:id/receive` **(admin)** — mark received; creates `RESTOCK` movements

## Errors
- Use standard HTTP codes. JSON:
```json
{ "error": { "code": "OUT_OF_STOCK", "message": "Not enough stock." } }
```
