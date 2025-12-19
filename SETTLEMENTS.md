# SETTLEMENTS.md — Lifecycle & Rules

## Lifecycle
1. **DRAFT** (created with date range)
2. **BILLED** (bills finalized; consumptions frozen + rollups written)
3. **FINALIZED** (all members paid; ledger credited)
4. **VOID** (reserved for future admin escape hatch; no UI yet)

## Inclusion Rules
- At **bill finalization** (`DRAFT → BILLED`), include all `Consumption.createdAt ∈ [startDate, endDate]` where:
  - `settlementId IS NULL`
  - `reversedAt IS NULL`
- Those consumptions are then **locked** by setting `settlementId` (immutable association).

## Totals
- Per-user total = Σ(`quantity * priceAtTxCents`) across included consumptions.
- `SettlementLine.breakdownJson` stores denormalized detail for quick export.

## Price Changes
- Settlement uses **price at time of consumption** (`priceAtTxCents`). Price edits do not retroactively affect totals.

## Corrections
- While a settlement is **DRAFT**, corrections are done by **reversing** mistaken consumptions:
  - Members can reverse their own recent transactions from `/app/account`.
  - Admins can reverse any member’s transactions from the settlement **Corrections** panel.
- Once bills are finalized (**BILLED**), included consumptions have `settlementId` set and **cannot be reversed**.
- If a mistake is discovered after billing:
  - Record a compensating adjustment in the next period (reverse + re-apply).
  - Or **VOID** the settlement (admin-only) and re-run (rare, UI not implemented yet). Both paths should be audit logged.

## Payments
- **BILLED** settlements track payments via `Payment` rows (admin-only checkbox UI).
- Settlement completion is a separate action:
  - You may only finalize a settlement once **all members are marked paid** (sum of payments per member ≥ their `SettlementLine.totalCents`).
  - Finalizing creates a single `LedgerEntry` **credit** with category `SETTLEMENT` for the settlement total.

## Exports
- CSV exports include:
  - Per-user rows with `settlementNumber`, `startDate`, `endDate`, totals, and a bank memo string (e.g., `Cafe 2025-01`).
  - A human-readable breakdown column (e.g., `Cold Brew x2; Energy Bar x1`) for quick review.
- Transaction-level export is also available for auditing.
- Draft exports are previews computed from live, unsettled consumptions. Billed/finalized exports read from `SettlementLine` rollups.

## Emails (optional)
- On finalize, send each member a link to their statement + amount due.
- Reminder emails can be scheduled (e.g., T+7 days for unpaid balances).
