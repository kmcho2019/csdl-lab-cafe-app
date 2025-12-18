"use client";

import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import { formatCurrency } from "@/lib/currency";

type PaymentLine = {
  userId: string;
  userName: string;
  userEmail: string;
  itemCount: number;
  totalCents: number;
  paidCents: number;
  isPaid: boolean;
};

type PaymentsResponse = {
  settlement: {
    id: string;
    number: number;
    startDate: string;
    endDate: string;
    status: "DRAFT" | "BILLED" | "FINALIZED" | "VOID";
    notes: string;
  };
  totals: { dueCents: number; paidCents: number };
  lines: PaymentLine[];
};

type SettlementSummary = {
  id: string;
  number: number;
  startDate: string;
  endDate: string;
  status: "DRAFT" | "BILLED" | "FINALIZED" | "VOID";
  notes: string;
  createdAt: string;
  finalizedAt: string | null;
  counts: { consumptions: number; lines: number; payments: number };
};

type Message = { type: "success" | "error"; text: string } | null;

export function SettlementPayments({
  settlementId,
  locale,
  currency,
  onSettlementUpdated,
  onNotify,
}: {
  settlementId: string;
  locale: string;
  currency: string;
  onSettlementUpdated: (settlement: SettlementSummary) => void;
  onNotify?: (message: { type: "success" | "error"; text: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [data, setData] = useState<PaymentsResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/settlements/${settlementId}/payments`);
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error?.message ?? "Unable to load payments");
      }
      setData((await response.json()) as PaymentsResponse);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to load payments");
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

  const allPaid = useMemo(() => {
    if (!data) {
      return false;
    }
    return data.lines.every((line) => line.isPaid);
  }, [data]);

  const toggleMutation = useMutation({
    mutationFn: async ({ userId, isPaid }: { userId: string; isPaid: boolean }) => {
      const response = await fetch(`/api/settlements/${settlementId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, isPaid }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error?.message ?? "Unable to update payment");
      }

      return response.json() as Promise<{ ok: true; settlement: SettlementSummary }>;
    },
    onSuccess: async (payload) => {
      setMessage({ type: "success", text: "Payment status updated." });
      onSettlementUpdated(payload.settlement);
      await load();
    },
    onError: (err: unknown) => {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Unable to update payment" });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/settlements/${settlementId}/complete`, { method: "POST" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error?.message ?? "Unable to finalize settlement");
      }
      return response.json() as Promise<{ settlement: SettlementSummary }>;
    },
    onSuccess: (payload) => {
      const text = `Settlement #${payload.settlement.number} finalized and ledger credited.`;
      setMessage({ type: "success", text });
      onNotify?.({ type: "success", text });
      onSettlementUpdated(payload.settlement);
    },
    onError: (err: unknown) => {
      const text = err instanceof Error ? err.message : "Unable to finalize settlement";
      setMessage({ type: "error", text });
      onNotify?.({ type: "error", text });
    },
  });

  return (
    <details
      className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer text-sm font-semibold text-slate-700">
        Payment tracking
      </summary>

      <div className="mt-4 space-y-4">
        <p className="text-sm text-slate-600">
          Mark each member as paid once their transfer arrives. When everyone is paid you can finalize the settlement to credit the ledger.
        </p>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-slate-700">
            Due{" "}
            <span className="font-semibold text-slate-900">
              {formatCurrency(data?.totals.dueCents ?? 0, currency, { locale })}
            </span>{" "}
            · Paid{" "}
            <span className="font-semibold text-slate-900">
              {formatCurrency(data?.totals.paidCents ?? 0, currency, { locale })}
            </span>
            {data && (
              <span className={`ml-2 rounded-full px-2 py-1 text-xs font-semibold ${allPaid ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                {allPaid ? "All paid" : "Pending"}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="rounded border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-brand hover:text-brand disabled:bg-slate-200"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            <button
              type="button"
              disabled={!allPaid || completeMutation.isPending}
              onClick={() => {
                const ok = window.confirm(
                  "Finalize this settlement?\n\nThis will lock the period and add the settlement total to the ledger.",
                );
                if (!ok) {
                  return;
                }
                setMessage(null);
                completeMutation.mutate();
              }}
              className="rounded bg-brand px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {completeMutation.isPending ? "Finalizing..." : "Finalize settlement"}
            </button>
          </div>
        </div>

        {message && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {message.text}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!error && loading && (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            Loading payments...
          </div>
        )}

        {data && (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">Member</th>
                  <th className="px-4 py-2 text-right">Items</th>
                  <th className="px-4 py-2 text-right">Due</th>
                  <th className="px-4 py-2 text-right">Paid</th>
                  <th className="px-4 py-2 text-right">Paid?</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.lines.map((line) => (
                  <tr key={line.userId}>
                    <td className="px-4 py-2">
                      <div className="font-medium text-slate-900">{line.userName || line.userEmail}</div>
                      <div className="text-xs text-slate-500">{line.userEmail}</div>
                    </td>
                    <td className="px-4 py-2 text-right text-slate-700">{line.itemCount}</td>
                    <td className="px-4 py-2 text-right font-semibold text-slate-900">
                      {formatCurrency(line.totalCents, currency, { locale })}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-700">
                      {formatCurrency(line.paidCents, currency, { locale })}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <input
                        aria-label={`Mark ${line.userEmail} paid`}
                        type="checkbox"
                        checked={line.isPaid}
                        disabled={toggleMutation.isPending}
                        onChange={(event) => {
                          const nextValue = event.target.checked;
                          if (!nextValue) {
                            const ok = window.confirm(`Unmark ${line.userEmail} as paid?`);
                            if (!ok) {
                              return;
                            }
                          }
                          setMessage(null);
                          toggleMutation.mutate({ userId: line.userId, isPaid: nextValue });
                        }}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    </td>
                  </tr>
                ))}

                {!data.lines.length && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
                      No billed members found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </details>
  );
}
