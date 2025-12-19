"use client";

import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import { formatCurrency } from "@/lib/currency";

type SettlementConsumption = {
  id: string;
  createdAt: string;
  user: { id: string; name: string | null; email: string };
  item: { id: string; name: string };
  quantity: number;
  priceAtTxCents: number;
  currency: string;
  settlementId: string | null;
  reversedAt: string | null;
};

type ListSettlementConsumptionsResponse = {
  settlement: {
    id: string;
    status: "DRAFT" | "BILLED" | "FINALIZED" | "VOID";
    startDate: string;
    endDate: string;
  };
  consumptions: SettlementConsumption[];
};

type ReverseConsumptionResponse = {
  consumption: { id: string; reversedAt: string };
  item: { id: string; currentStock: number };
};

type Message = { type: "success" | "error"; text: string } | null;

export function SettlementCorrections({ settlementId }: { settlementId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [error, setError] = useState<string | null>(null);
  const [consumptions, setConsumptions] = useState<SettlementConsumption[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const locale = useMemo(() => Intl.DateTimeFormat().resolvedOptions().locale, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/settlements/${settlementId}/consumptions?limit=50&includeReversed=true`);
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error?.message ?? "Unable to load consumptions");
      }

      const payload = (await response.json()) as ListSettlementConsumptionsResponse;
      setConsumptions(payload.consumptions);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to load consumptions");
    } finally {
      setLoading(false);
    }
  }, [settlementId]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (consumptions) {
      return;
    }
    void load();
  }, [open, consumptions, load]);

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
        return prev.map((consumption) =>
          consumption.id === payload.consumption.id ? { ...consumption, reversedAt: payload.consumption.reversedAt } : consumption,
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

  const reversible = useMemo(
    () => (consumptions ?? []).filter((consumption) => consumption.reversedAt == null),
    [consumptions],
  );

  return (
    <details
      className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer text-sm font-semibold text-slate-700">
        Corrections ({reversible.length} reversible)
      </summary>

      <div className="mt-4 space-y-4">
        <p className="text-sm text-slate-600">
          Reverse mistaken consumptions before bills are finalized. Reversed transactions are excluded from the settlement export.
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-brand hover:text-brand disabled:bg-slate-200"
          >
            {loading ? "Refreshing..." : "Refresh list"}
          </button>
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

        {open && !loading && !error && consumptions && consumptions.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-600">
            No unsettled consumptions found in this settlement window.
          </div>
        )}

        {consumptions && consumptions.length > 0 && (
          <div className="space-y-3">
            {consumptions.map((consumption) => {
              const totalCents = consumption.priceAtTxCents * consumption.quantity;
              const isReversed = consumption.reversedAt != null;

              return (
                <div key={consumption.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-slate-900">{consumption.item.name}</div>
                        {isReversed && (
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
                            Reversed
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-600">
                        {new Date(consumption.createdAt).toLocaleString(locale)} · {consumption.user.name ?? consumption.user.email} · Qty {consumption.quantity} ·{" "}
                        {formatCurrency(totalCents, consumption.currency, { locale })}
                      </div>
                      <div className="text-[11px] text-slate-400">ID {consumption.id}</div>
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
                            const note = notes[consumption.id]?.trim() || undefined;
                            const ok = window.confirm(
                              `Reverse this transaction for ${consumption.user.email}?\\n\\n${consumption.item.name} × ${consumption.quantity}`,
                            );
                            if (!ok) {
                              return;
                            }
                            reverseMutation.mutate({ consumptionId: consumption.id, note });
                          }}
                        >
                          <label className="text-xs font-medium text-slate-700">
                            Note (optional, max 200 chars, Unicode ok)
                            <input
                              type="text"
                              value={notes[consumption.id] ?? ""}
                              maxLength={200}
                              onChange={(event) =>
                                setNotes((prev) => ({
                                  ...prev,
                                  [consumption.id]: event.target.value,
                                }))
                              }
                              className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm"
                              placeholder="Mis-click / wrong member selected"
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
        )}
      </div>
    </details>
  );
}
