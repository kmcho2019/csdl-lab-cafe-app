"use client";

import { useCallback, useEffect, useState } from "react";

import { formatCurrency } from "@/lib/currency";

type PreviewLine = {
  userId: string;
  userName: string;
  userEmail: string;
  itemCount: number;
  totalCents: number;
  breakdown: Array<{
    itemId: string;
    itemName: string;
    quantity: number;
    unitPriceCents: number;
    totalCents: number;
  }>;
};

type PreviewResponse = {
  settlement: {
    id: string;
    number: number;
    startDate: string;
    endDate: string;
    status: "DRAFT" | "BILLED" | "FINALIZED" | "VOID";
    notes: string;
  };
  totals: { totalCents: number; totalItemCount: number; consumptionCount: number };
  itemTotals: Array<{ itemId: string; itemName: string; quantity: number; totalCents: number }>;
  lines: PreviewLine[];
};

export function SettlementPreview({ settlementId, locale, currency }: { settlementId: string; locale: string; currency: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PreviewResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/settlements/${settlementId}/preview`);
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error?.message ?? "Unable to load preview");
      }
      setData((await response.json()) as PreviewResponse);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to load preview");
    } finally {
      setLoading(false);
    }
  }, [settlementId]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (data) {
      return;
    }
    void load();
  }, [open, data, load]);

  return (
    <details
      className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer text-sm font-semibold text-slate-700">
        Preview bills
      </summary>

      <div className="mt-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-slate-600">
            Total:{" "}
            <span className="font-semibold text-slate-900">
              {formatCurrency(data?.totals.totalCents ?? 0, currency, { locale })}
            </span>{" "}
            · {data?.totals.totalItemCount ?? 0} items · {data?.lines.length ?? 0} members
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-brand hover:text-brand disabled:bg-slate-200"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!error && loading && (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            Loading preview...
          </div>
        )}

        {data && (
          <>
            <details className="rounded-lg border border-slate-200 bg-white p-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                Totals by item ({data.itemTotals.length})
              </summary>
              <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2">Item</th>
                      <th className="px-4 py-2 text-right">Qty</th>
                      <th className="px-4 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.itemTotals.map((row) => (
                      <tr key={row.itemId}>
                        <td className="px-4 py-2 font-medium text-slate-900">{row.itemName}</td>
                        <td className="px-4 py-2 text-right text-slate-700">{row.quantity}</td>
                        <td className="px-4 py-2 text-right font-semibold text-slate-900">
                          {formatCurrency(row.totalCents, currency, { locale })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>

            <div className="space-y-3">
              {data.lines.map((line) => (
                <details key={line.userId} className="rounded-xl border border-slate-200 bg-white p-4">
                  <summary className="cursor-pointer">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm font-semibold text-slate-900">{line.userName || line.userEmail}</div>
                      <div className="text-sm font-semibold text-slate-900">
                        {formatCurrency(line.totalCents, currency, { locale })}
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{line.itemCount} items · {line.userEmail}</div>
                  </summary>
                  <div className="mt-4 space-y-2 text-sm">
                    {line.breakdown.map((item) => (
                      <div key={`${item.itemId}:${item.unitPriceCents}`} className="flex items-center justify-between">
                        <div className="text-slate-700">
                          {item.itemName} × {item.quantity}
                        </div>
                        <div className="font-semibold text-slate-900">
                          {formatCurrency(item.totalCents, currency, { locale })}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              ))}

              {!data.lines.length && (
                <div className="rounded-lg border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-600">
                  No billable consumptions in this window.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </details>
  );
}
