"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { formatCurrency } from "@/lib/currency";

type Transaction = {
  id: string;
  createdAt: string;
  reversedAt: string | null;
  settlementId: string | null;
  user: { id: string; name: string | null; email: string };
  item: { id: string; name: string };
  quantity: number;
  unitPriceCents: number;
  currency: string;
  chargedCents: number;
  stockDeltaUnits: number;
  owedDeltaCents: number;
  reversal: { stockDeltaUnits: number; owedDeltaCents: number } | null;
};

type TransactionsResponse = {
  nextCursor: string | null;
  transactions: Transaction[];
};

type Message = { type: "success" | "error"; text: string } | null;

function toIsoStartOfDay(date: string) {
  return new Date(`${date}T00:00:00.000Z`).toISOString();
}

function toIsoEndOfDay(date: string) {
  return new Date(`${date}T23:59:59.999Z`).toISOString();
}

export function TransactionsManager({ locale, currency }: { locale: string; currency: string }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [includeReversed, setIncludeReversed] = useState(true);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", "50");
    if (fromDate) params.set("from", toIsoStartOfDay(fromDate));
    if (toDate) params.set("to", toIsoEndOfDay(toDate));
    params.set("includeReversed", includeReversed ? "true" : "false");
    return params.toString();
  }, [fromDate, toDate, includeReversed]);

  const loadPage = useCallback(async (next: { reset: boolean; cursor?: string | null }) => {
    setLoading(true);
    setMessage(null);
    try {
      const params = new URLSearchParams(queryString);
      if (next.cursor) {
        params.set("cursor", next.cursor);
      }
      const res = await fetch(`/api/admin/transactions?${params.toString()}`);
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error?.message ?? "Unable to load transactions");
      }
      const payload = (await res.json()) as TransactionsResponse;

      setTransactions((prev) => (next.reset ? payload.transactions : [...prev, ...payload.transactions]));
      setCursor(next.cursor ?? null);
      setNextCursor(payload.nextCursor);
    } catch (err: unknown) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Unable to load transactions" });
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    void loadPage({ reset: true });
  }, [loadPage]);

  return (
    <div className="space-y-6">
      <header className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Transactions</h1>
        <p className="mt-2 text-sm text-slate-600">
          Consumption history across all members. Use filters to narrow the time window.
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Filters</h2>
        <form
          className="mt-4 grid gap-4 md:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            void loadPage({ reset: true });
          }}
        >
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
            From
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="rounded border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
            To
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="rounded border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none"
            />
          </label>
          <label className="mt-7 flex items-center gap-2 text-sm font-medium text-slate-600">
            <input
              type="checkbox"
              checked={includeReversed}
              onChange={(event) => setIncludeReversed(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Include reversed
          </label>
          <div className="mt-7 flex items-center gap-2">
            <button
              type="submit"
              disabled={loading}
              className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {loading ? "Loading..." : "Apply"}
            </button>
          </div>
        </form>
      </section>

      {message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3 text-right">Qty</th>
              <th className="px-4 py-3 text-right">Charge</th>
              <th className="px-4 py-3 text-right">Stock Δ</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
            {transactions.map((tx) => (
              <tr key={tx.id}>
                <td className="px-4 py-3 align-top text-xs text-slate-500">
                  {tx.createdAt.slice(0, 16).replace("T", " ")}
                </td>
                <td className="px-4 py-3 align-top">
                  <div className="font-medium text-slate-900">{tx.user.name ?? tx.user.email}</div>
                  <div className="text-xs text-slate-500">{tx.user.email}</div>
                </td>
                <td className="px-4 py-3 align-top">
                  <div className="font-medium text-slate-900">{tx.item.name}</div>
                  <div className="text-xs text-slate-500">
                    {formatCurrency(tx.unitPriceCents, currency, { locale })} each
                  </div>
                </td>
                <td className="px-4 py-3 align-top text-right font-semibold text-slate-900">
                  {tx.quantity}
                </td>
                <td className="px-4 py-3 align-top text-right font-semibold text-slate-900">
                  {formatCurrency(tx.chargedCents, currency, { locale })}
                  {tx.reversal && (
                    <div className="text-xs font-medium text-slate-500">
                      {formatCurrency(tx.reversal.owedDeltaCents, currency, { locale })} reversal
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 align-top text-right font-semibold text-slate-900">
                  {tx.stockDeltaUnits}
                  {tx.reversal && (
                    <div className="text-xs font-medium text-slate-500">
                      {tx.reversal.stockDeltaUnits} reversal
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 align-top text-xs">
                  {tx.settlementId ? (
                    <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-600">
                      Settled
                    </span>
                  ) : tx.reversedAt ? (
                    <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-600">
                      Reversed
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">
                      Open
                    </span>
                  )}
                  {tx.reversedAt && (
                    <div className="mt-2 text-[11px] text-slate-500">
                      reversed {tx.reversedAt.slice(0, 16).replace("T", " ")}
                    </div>
                  )}
                </td>
              </tr>
            ))}

            {!transactions.length && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                  No transactions found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500">{transactions.length} loaded</div>
        <button
          type="button"
          disabled={!nextCursor || loading}
          onClick={() => void loadPage({ reset: false, cursor: nextCursor })}
          className="rounded border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
        >
          {loading ? "Loading..." : nextCursor ? "Load more" : "No more"}
        </button>
      </div>
    </div>
  );
}
