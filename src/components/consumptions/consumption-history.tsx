"use client";

import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { formatCurrency } from "@/lib/currency";

type ConsumptionEntry = {
  id: string;
  createdAt: string;
  item: { id: string; name: string };
  quantity: number;
  priceAtTxCents: number;
  currency: string;
  settlementId: string | null;
  reversedAt: string | null;
};

type ListConsumptionsResponse = {
  consumptions: ConsumptionEntry[];
};

type ReverseConsumptionResponse = {
  consumption: { id: string; reversedAt: string };
  item: { id: string; currentStock: number };
};

type Message = { type: "success" | "error"; text: string } | null;

export function ConsumptionHistory({ locale }: { locale: string }) {
  const [loading, setLoading] = useState(false);
  const [consumptions, setConsumptions] = useState<ConsumptionEntry[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<Message>(null);
  const [error, setError] = useState<string | null>(null);

  const openConsumptions = useMemo(
    () => (consumptions ?? []).filter((entry) => entry.settlementId == null),
    [consumptions],
  );

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/consumptions?limit=25&includeReversed=true&includeSettled=false");
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error?.message ?? "Unable to load transactions");
      }

      const payload = (await response.json()) as ListConsumptionsResponse;
      setConsumptions(payload.consumptions);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to load transactions");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const reverseMutation = useMutation({
    mutationFn: async ({ consumptionId, note }: { consumptionId: string; note?: string }) => {
      const response = await fetch(`/api/consumptions/${consumptionId}/reverse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error?.message ?? "Unable to reverse transaction");
      }

      return (await response.json()) as ReverseConsumptionResponse;
    },
    onSuccess: (payload) => {
      setConsumptions((prev) => {
        if (!prev) {
          return prev;
        }
        return prev.map((entry) =>
          entry.id === payload.consumption.id ? { ...entry, reversedAt: payload.consumption.reversedAt } : entry,
        );
      });
      setNotes((prev) => {
        const next = { ...prev };
        delete next[payload.consumption.id];
        return next;
      });
      setMessage({ type: "success", text: "Transaction reversed." });
    },
    onError: (err: unknown) => {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Unable to reverse transaction" });
    },
  });

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Recent transactions</h2>
          <p className="mt-1 text-sm text-slate-600">
            Reverse mistakes before the monthly settlement is finalized.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-brand hover:text-brand disabled:bg-slate-200"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {message && (
        <div
          className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
            message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-4 space-y-3">
        {!openConsumptions.length && !loading && !error && (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            No open transactions yet.
          </div>
        )}

        {openConsumptions.map((entry) => {
          const totalCents = entry.priceAtTxCents * entry.quantity;
          const isReversed = entry.reversedAt != null;

          return (
            <div key={entry.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-semibold text-slate-900">{entry.item.name}</div>
                    {isReversed && (
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
                        Reversed
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-600">
                    {new Date(entry.createdAt).toLocaleString(locale)} · Qty {entry.quantity} ·{" "}
                    {formatCurrency(totalCents, entry.currency, { locale })}
                  </div>
                </div>

                {!isReversed && (
                  <details className="rounded-lg border border-red-200 bg-red-50/40 p-3">
                    <summary className="cursor-pointer text-xs font-semibold text-red-700">
                      Reverse
                    </summary>
                    <form
                      className="mt-3 flex flex-col gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const note = notes[entry.id]?.trim() || undefined;
                        const ok = window.confirm(`Reverse this transaction?\\n\\n${entry.item.name} × ${entry.quantity}`);
                        if (!ok) {
                          return;
                        }
                        reverseMutation.mutate({ consumptionId: entry.id, note });
                      }}
                    >
                      <label className="text-xs font-medium text-slate-700">
                        Note (optional, max 200 chars, Unicode ok)
                        <input
                          type="text"
                          value={notes[entry.id] ?? ""}
                          maxLength={200}
                          onChange={(event) =>
                            setNotes((prev) => ({
                              ...prev,
                              [entry.id]: event.target.value,
                            }))
                          }
                          className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm"
                          placeholder="Mis-click"
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={reverseMutation.isPending}
                        className="mt-1 rounded bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:bg-slate-300"
                      >
                        {reverseMutation.isPending ? "Reversing..." : "Confirm reverse"}
                      </button>
                    </form>
                  </details>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
