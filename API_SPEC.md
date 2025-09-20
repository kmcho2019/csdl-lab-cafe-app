# API_SPEC.md

> REST-ish API shape (can also be implemented with tRPC). All endpoints require auth; admin-only endpoints are noted.

Base URL: `/api`

## Auth (Auth.js — handled by library)
- `GET /api/auth/*` — OAuth callbacks, session, CSRF, etc.

## Users
- `GET /users` **(admin)** — list users (filter by active, role).
- `POST /users` **(admin)** — create user manually.
- `PATCH /users/:id` **(admin)** — update role, isActive.
- `GET /me` — current user profile.

### Example
```http
PATCH /api/users/clxy123
{ "role": "ADMIN", "isActive": true }
```

## Allowlist
- `GET /allowlist` **(admin)**
- `POST /allowlist` **(admin)** — add email or domain pattern.
- `DELETE /allowlist/:id` **(admin)**

## Items
- `GET /items?active=true`
- `POST /items` **(admin)**
- `PATCH /items/:id` **(admin)** — change name, price, thresholds.
- `POST /items/:id/restock` **(admin)** — `{ qty, unitCost, note? }`
- `POST /items/:id/writeoff` **(admin)** — `{ qty, reason }`

## Consumption
- `POST /consumptions` — `{ itemId, quantity=1 }`
- `GET /consumptions?userId&from&to&settled=false`

### Example
```http
POST /api/consumptions
{ "itemId": "it_123", "quantity": 1 }
→ 200 { "id": "tx_456", "priceAtTx": 150, "currency": "USD", "newStock": 11 }
```

## Settlements
- `POST /settlements` **(admin)** — `{ startDate, endDate }` → DRAFT
- `GET /settlements/:id` **(admin)** — details + preview
- `POST /settlements/:id/finalize` **(admin)**
- `POST /settlements/:id/void` **(admin)**
- `GET /settlements/:id/export?format=csv|xlsx` **(admin)**
- `GET /settlements` **(admin)** — list, filter by status/date
- `POST /settlements/:id/payments` **(admin)** — record payment for a user

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
