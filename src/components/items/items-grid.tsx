"use client";

import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";

type Item = {
  id: string;
  name: string;
  category: string | null;
  unit: string | null;
  priceCents: number;
  currency: string;
  currentStock: number;
  lowStockThreshold: number;
};

type ConsumptionResponse = {
  consumption: {
    id: string;
    priceAtTxCents: number;
    currency: string;
  };
  newStock: number;
};

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

export function ItemsGrid({ items }: { items: Item[] }) {
  const [inventory, setInventory] = useState(items);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);

  const grouped = useMemo(() => {
    return inventory.reduce<Record<string, Item[]>>((acc, item) => {
      const key = item.category ?? "Other";
      acc[key] = acc[key] ?? [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [inventory]);

  const consumeMutation = useMutation({
    mutationFn: async ({ itemId, quantity }: { itemId: string; quantity: number }) => {
      const res = await fetch("/api/consumptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, quantity }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error?.message ?? "Unable to record consumption");
      }

      return (await res.json()) as ConsumptionResponse;
    },
    onSuccess: (data, variables) => {
      setInventory((prev) =>
        prev.map((item) => (item.id === variables.itemId ? { ...item, currentStock: data.newStock } : item)),
      );
      setMessage(`Enjoy! ${formatMoney(data.consumption.priceAtTxCents, data.consumption.currency)} recorded.`);
      setMessageType("success");
    },
    onError: (error: unknown) => {
      setMessage(error instanceof Error ? error.message : "Could not record consumption");
      setMessageType("error");
    },
  });

  return (
    <div className="space-y-4">
      {message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${messageType === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}
        >
          {message}
        </div>
      )}

      <div className="space-y-6">
        {Object.entries(grouped).map(([category, categoryItems]) => (
          <section key={category} className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{category}</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {categoryItems.map((item) => {
                const disabled = item.currentStock <= 0 || consumeMutation.isPending;
                const lowStock = item.currentStock <= item.lowStockThreshold;

                return (
                  <div
                    key={item.id}
                    className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-base font-semibold text-slate-900">{item.name}</h3>
                        <span className="text-sm font-semibold text-slate-700">
                          {formatMoney(item.priceCents, item.currency)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        {item.currentStock} {item.unit ?? "units"} in stock
                      </p>
                      {lowStock && (
                        <p className="text-xs font-medium text-amber-600">Low stock — please restock soon.</p>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => consumeMutation.mutate({ itemId: item.id, quantity: 1 })}
                      className="mt-4 inline-flex items-center justify-center rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {consumeMutation.isPending ? "Recording..." : "Take one"}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
