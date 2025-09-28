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
- `POST /items/:id/restock` **(admin)** — `{ qty, unitCost, note? }`
- `POST /items/:id/writeoff` **(admin)** — `{ qty, reason }`

## Kiosk
- `POST /kiosk/checkout` **(admin)** — `{ userId, cart: [{ itemId, quantity }] }`

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
