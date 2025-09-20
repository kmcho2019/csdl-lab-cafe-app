# SETTLEMENTS.md — Lifecycle & Rules

## Lifecycle
1. **DRAFT** (created with date range)
2. **PREVIEW** (computed, shown in UI) — implicit state inside DRAFT
3. **FINALIZED**
4. **VOID** (optional admin escape hatch; audit required)

## Inclusion Rules
- Include all `Consumption.createdAt ∈ [startDate, endDate]` with `settlementId IS NULL` at finalize time.
- Once finalized, those consumptions are **locked** by setting `settlementId` (immutable association).

## Totals
- Per-user total = Σ(`quantity * priceAtTxCents`) across included consumptions.
- `SettlementLine.breakdownJson` stores denormalized detail for quick export.

## Price Changes
- Settlement uses **price at time of consumption** (`priceAtTxCents`). Price edits do not retroactively affect totals.

## Corrections
- If a mistake is found **after** finalize:
  - Record a **compensating adjustment** in the next period (reverse + re-apply).
  - Or **VOID** the settlement (admin-only) and re-run (rare). Both paths are audit logged.

## Payments
- Payment receipts are recorded as `LedgerEntry` **credits** and `Payment` rows linked to the user + settlement.
- A member may pay partial amounts; `Payment` rows accumulate.

## Exports
- CSV/Excel include:
  - Header with date range, settlement number, generation timestamp.
  - Per-user rows: `User, Items, Total (minor units), Bank memo (e.g., "Cafe 2025-01 — 2025-02")`.
- Transaction-level export is also available for auditing.

## Emails (optional)
- On finalize, send each member a link to their statement + amount due.
- Reminder emails can be scheduled (e.g., T+7 days for unpaid balances).

