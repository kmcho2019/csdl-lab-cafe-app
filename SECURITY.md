# SECURITY.md

## Authentication
- Auth.js (NextAuth) with GitHub provider.
- Only users with emails **explicitly allowlisted** or matching allowlisted **domains** may complete sign‑in.
- Sessions use secure, HTTP‑only cookies; CSRF enabled on mutating routes.

## Authorization
- Role-based access control:
  - `MEMBER`: may read items, create own consumptions, read own history.
  - `ADMIN`: may manage users, items, settlements, ledger, reports.
- Server-side checks in API layer + client route guards.

## Data Protection
- Store **minimal PII** (name, email). No bank/account numbers.
- Secrets only in environment variables.
- TLS enforced in prod; HSTS recommended.

## Auditing
- Every admin mutation writes an `AuditLog` with actor, action, entity, diff, IP.
- Stock/price changes always audited.

## Input Validation & Safety
- All payloads schema-validated (e.g., Zod).
- Rate-limit write endpoints to deter abuse.
- Double-submit protection for “Take one” with idempotency keys.
- Concurrency: DB transactions + row locking on stock updates.

## Backup & Restore
- Nightly `pg_dump` (retain 30 days) with encryption-at-rest (in your storage).
- Document recovery runbook; test restores quarterly.

## Compliance Notes
- This is an internal tool with university users; follow lab IT policy.
- EU/UK users: ensure appropriate retention notices if applicable.

