"use client";

import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";

const formatterCache = new Map<string, Intl.NumberFormat>();

function formatMoney(valueCents: number, currency: string) {
  if (!formatterCache.has(currency)) {
    formatterCache.set(
      currency,
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
      }),
    );
  }

  return formatterCache.get(currency)!.format(valueCents / 100);
}

type Message = { type: "success" | "error"; text: string } | null;

type InventoryItem = {
  id: string;
  name: string;
  category: string | null;
  unit: string | null;
  priceCents: number;
  currency: string;
  currentStock: number;
  lowStockThreshold: number;
  isActive: boolean;
};

type RestockPayload = {
  itemId: string;
  quantity: number;
  unitCostCents?: number;
  note?: string;
};

type WriteOffPayload = {
  itemId: string;
  quantity: number;
  reason?: string;
  recordLedger: boolean;
};

export function InventoryManager({ items }: { items: InventoryItem[] }) {
  const [state, setState] = useState(items);
  const [message, setMessage] = useState<Message>(null);

  const categories = useMemo(() => {
    return state.reduce<Record<string, InventoryItem[]>>((acc, item) => {
      const key = item.category ?? "Uncategorized";
      acc[key] = acc[key] ?? [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [state]);

  const restockMutation = useMutation({
    mutationFn: async ({ itemId, quantity, unitCostCents, note }: RestockPayload) => {
      const res = await fetch(`/api/items/${itemId}/restock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity, unitCostCents, note }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error?.message ?? "Could not restock item");
      }

      return res.json() as Promise<{ item: InventoryItem }>;
    },
    onSuccess: async (payload) => {
      setState((prev) => prev.map((item) => (item.id === payload.item.id ? { ...item, ...payload.item } : item)));
      setMessage({ type: "success", text: "Restock saved" });
    },
    onError: (error: unknown) => {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Restock failed" });
    },
  });

  const writeOffMutation = useMutation({
    mutationFn: async ({ itemId, quantity, reason, recordLedger }: WriteOffPayload) => {
      const res = await fetch(`/api/items/${itemId}/writeoff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity, reason, recordLedger }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error?.message ?? "Could not write off item");
      }

      return res.json() as Promise<{ item: InventoryItem }>;
    },
    onSuccess: async (payload) => {
      setState((prev) => prev.map((item) => (item.id === payload.item.id ? { ...item, ...payload.item } : item)));
      setMessage({ type: "success", text: "Write-off recorded" });
    },
    onError: (error: unknown) => {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Write-off failed" });
    },
  });

  return (
    <div className="space-y-6">
      <header className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Inventory</h1>
        <p className="mt-2 text-sm text-slate-600">Restock or write off items. Admin only.</p>
      </header>

      {message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}
        >
          {message.text}
        </div>
      )}

      <div className="space-y-8">
        {Object.entries(categories).map(([category, categoryItems]) => (
          <section key={category} className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{category}</h2>
            <div className="space-y-3">
              {categoryItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">{item.name}</h3>
                      <p className="text-sm text-slate-500">
                        {item.currentStock} {item.unit ?? "units"} · {formatMoney(item.priceCents, item.currency)} price
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <details className="group rounded-lg border border-slate-200 p-3">
                        <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                          Restock
                        </summary>
                        <form
                          className="mt-3 flex flex-col gap-2"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const formData = new FormData(event.currentTarget);
                            const quantity = Number(formData.get("quantity"));
                            const unitCost = formData.get("unitCost");
                            const note = formData.get("note")?.toString();

                            restockMutation.mutate({
                              itemId: item.id,
                              quantity,
                              unitCostCents: unitCost ? Number(unitCost) : undefined,
                              note: note || undefined,
                            });
                          }}
                        >
                          <label className="text-xs font-medium text-slate-500">
                            Quantity
                            <input
                              name="quantity"
                              type="number"
                              min={1}
                              defaultValue={12}
                              className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-sm"
                              required
                            />
                          </label>
                          <label className="text-xs font-medium text-slate-500">
                            Unit cost (cents)
                            <input
                              name="unitCost"
                              type="number"
                              min={0}
                              className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-sm"
                            />
                          </label>
                          <label className="text-xs font-medium text-slate-500">
                            Note
                            <input
                              name="note"
                              type="text"
                              className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-sm"
                            />
                          </label>
                          <button
                            type="submit"
                            disabled={restockMutation.isPending}
                            className="mt-2 rounded bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:bg-slate-300"
                          >
                            {restockMutation.isPending ? "Saving..." : "Save"}
                          </button>
                        </form>
                      </details>

                      <details className="group rounded-lg border border-slate-200 p-3">
                        <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                          Write-off
                        </summary>
                        <form
                          className="mt-3 flex flex-col gap-2"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const formData = new FormData(event.currentTarget);
                            const quantity = Number(formData.get("quantity"));
                            const reason = formData.get("reason")?.toString();
                            const recordLedger = formData.get("ledger") === "on";

                            writeOffMutation.mutate({
                              itemId: item.id,
                              quantity,
                              reason: reason || undefined,
                              recordLedger,
                            });
                          }}
                        >
                          <label className="text-xs font-medium text-slate-500">
                            Quantity
                            <input
                              name="quantity"
                              type="number"
                              min={1}
                              defaultValue={1}
                              className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-sm"
                              required
                            />
                          </label>
                          <label className="text-xs font-medium text-slate-500">
                            Reason
                            <input
                              name="reason"
                              type="text"
                              className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-sm"
                              placeholder="Expiry, damage, etc."
                            />
                          </label>
                          <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
                            <input name="ledger" type="checkbox" className="h-4 w-4" />
                            Record ledger debit
                          </label>
                          <button
                            type="submit"
                            disabled={writeOffMutation.isPending}
                            className="mt-2 rounded bg-red-500 px-3 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:bg-slate-300"
                          >
                            {writeOffMutation.isPending ? "Saving..." : "Save"}
                          </button>
                        </form>
                      </details>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
