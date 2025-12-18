"use client";

import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { formatCurrency } from "@/lib/currency";

import { CreateItemForm } from "@/components/inventory/create-item-form";
import { ItemEditForm } from "@/components/inventory/item-edit-form";

type Message = { type: "success" | "error"; text: string } | null;

export type InventoryItem = {
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

type ArchivePayload = {
  itemId: string;
  confirmName: string;
};

type ReactivatePayload = {
  itemId: string;
};

export function InventoryManager({
  items,
  locale,
  currency,
}: {
  items: InventoryItem[];
  locale: string;
  currency: string;
}) {
  const [state, setState] = useState(items);
  const [message, setMessage] = useState<Message>(null);
  const [archiveConfirm, setArchiveConfirm] = useState<Record<string, string>>({});

  const activeItems = useMemo(() => state.filter((item) => item.isActive), [state]);
  const archivedItems = useMemo(() => state.filter((item) => !item.isActive), [state]);

  const activeCategories = useMemo(() => {
    return activeItems.reduce<Record<string, InventoryItem[]>>((acc, item) => {
      const key = item.category ?? "Uncategorized";
      acc[key] = acc[key] ?? [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [activeItems]);

  const archivedCategories = useMemo(() => {
    return archivedItems.reduce<Record<string, InventoryItem[]>>((acc, item) => {
      const key = item.category ?? "Uncategorized";
      acc[key] = acc[key] ?? [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [archivedItems]);

  const categoryOptions = useMemo(() => {
    return Array.from(new Set(state.map((item) => item.category).filter((category): category is string => Boolean(category)))).sort((a, b) =>
      a.localeCompare(b,
        undefined,
        { sensitivity: "base" },
      ),
    );
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

  const archiveMutation = useMutation({
    mutationFn: async ({ itemId, confirmName }: ArchivePayload) => {
      const res = await fetch(`/api/items/${itemId}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmName }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error?.message ?? "Could not archive item");
      }

      return res.json() as Promise<{ item: InventoryItem }>;
    },
    onSuccess: async (payload) => {
      setState((prev) => prev.map((item) => (item.id === payload.item.id ? { ...item, ...payload.item } : item)));
      setArchiveConfirm((prev) => {
        const next = { ...prev };
        delete next[payload.item.id];
        return next;
      });
      setMessage({ type: "success", text: `${payload.item.name} archived.` });
    },
    onError: (error: unknown) => {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Archive failed" });
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: async ({ itemId }: ReactivatePayload) => {
      const res = await fetch(`/api/items/${itemId}/reactivate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error?.message ?? "Could not reactivate item");
      }

      return res.json() as Promise<{ item: InventoryItem }>;
    },
    onSuccess: async (payload) => {
      setState((prev) => prev.map((item) => (item.id === payload.item.id ? { ...item, ...payload.item } : item)));
      setMessage({ type: "success", text: `${payload.item.name} reactivated.` });
    },
    onError: (error: unknown) => {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Reactivation failed" });
    },
  });

  return (
    <div className="space-y-6">
      <header className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Inventory</h1>
        <p className="mt-2 text-sm text-slate-600">Create new menu items, restock, write off stock, or archive items.</p>
      </header>

      <CreateItemForm
        defaultCurrency={currency}
        onCreated={(item) => {
          setState((prev) => {
            const existingIndex = prev.findIndex((existing) => existing.id === item.id);
            if (existingIndex !== -1) {
              const next = [...prev];
              next[existingIndex] = item;
              return next;
            }
            return [...prev, item];
          });
        }}
      />

      {message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}
        >
          {message.text}
        </div>
      )}

      <div className="space-y-8">
        {Object.entries(activeCategories).map(([category, categoryItems]) => (
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
                        {item.currentStock} {item.unit ?? "units"} · {formatCurrency(item.priceCents, item.currency, { locale })} price
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <details className="group rounded-lg border border-slate-200 p-3">
                        <summary className="cursor-pointer text-sm font-semibold text-slate-700">Edit</summary>
                        <ItemEditForm
                          item={item}
                          categories={categoryOptions}
                          currency={currency}
                          onSaved={(updatedItem) => {
                            setState((prev) => prev.map((candidate) => (candidate.id === updatedItem.id ? { ...candidate, ...updatedItem } : candidate)));
                            setMessage({ type: "success", text: `${updatedItem.name} updated.` });
                          }}
                          onError={(errorMessage) => setMessage({ type: "error", text: errorMessage })}
                        />
                      </details>
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
                            Unit cost (minor units)
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

                      <details className="group rounded-lg border border-red-200 bg-red-50/60 p-3">
                        <summary className="cursor-pointer text-sm font-semibold text-red-700">
                          Archive
                        </summary>
                        <form
                          className="mt-3 flex flex-col gap-2"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const confirmName = archiveConfirm[item.id] ?? "";
                            archiveMutation.mutate({ itemId: item.id, confirmName });
                          }}
                        >
                          <p className="text-xs text-slate-700">
                            Archiving hides this item from members and kiosk checkout. You can reactivate it later from the archived list.
                          </p>
                          <p className="text-xs text-slate-700">
                            Stock must be <span className="font-semibold">0</span> (currently {item.currentStock}).
                          </p>
                          {item.currentStock !== 0 ? (
                            <p className="text-xs font-medium text-red-700">
                              Write off the remaining stock before archiving.
                            </p>
                          ) : (
                            <label className="text-xs font-medium text-slate-700">
                              Type <span className="font-semibold">{item.name}</span> to confirm
                              <input
                                type="text"
                                value={archiveConfirm[item.id] ?? ""}
                                onChange={(event) =>
                                  setArchiveConfirm((prev) => ({
                                    ...prev,
                                    [item.id]: event.target.value,
                                  }))
                                }
                                className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm"
                              />
                            </label>
                          )}
                          <button
                            type="submit"
                            disabled={
                              archiveMutation.isPending ||
                              item.currentStock !== 0 ||
                              (archiveConfirm[item.id] ?? "").trim() !== item.name.trim()
                            }
                            className="mt-2 rounded bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:bg-slate-300"
                          >
                            {archiveMutation.isPending ? "Archiving..." : "Archive item"}
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

        <details className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">
            Archived items ({archivedItems.length})
          </summary>
          <div className="mt-6 space-y-8">
            {archivedItems.length === 0 ? (
              <p className="text-sm text-slate-600">No archived items.</p>
            ) : (
              Object.entries(archivedCategories).map(([category, categoryItems]) => (
                <section key={category} className="space-y-4">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{category}</h2>
                  <div className="space-y-3">
                    {categoryItems.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-xl border border-slate-200 bg-slate-50 p-6 shadow-sm"
                      >
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-base font-semibold text-slate-900">{item.name}</h3>
                              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
                                Archived
                              </span>
                            </div>
                            <p className="text-sm text-slate-500">
                              {item.currentStock} {item.unit ?? "units"} · {formatCurrency(item.priceCents, item.currency, { locale })} price
                            </p>
                            {item.currentStock !== 0 && (
                              <p className="mt-1 text-xs font-medium text-red-700">
                                Stock is not zero — write off remaining stock before leaving this item archived.
                              </p>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-3">
                            <button
                              type="button"
                              disabled={reactivateMutation.isPending}
                              onClick={() => {
                                if (!window.confirm(`Reactivate "${item.name}"? This will make it visible to members again.`)) {
                                  return;
                                }

                                reactivateMutation.mutate({ itemId: item.id });
                              }}
                              className="rounded bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-300"
                            >
                              {reactivateMutation.isPending ? "Reactivating..." : "Reactivate"}
                            </button>

                            <details className="group rounded-lg border border-slate-200 bg-white p-3">
                              <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                                Edit
                              </summary>
                              <ItemEditForm
                                item={item}
                                categories={categoryOptions}
                                currency={currency}
                                onSaved={(updatedItem) => {
                                  setState((prev) =>
                                    prev.map((candidate) =>
                                      candidate.id === updatedItem.id ? { ...candidate, ...updatedItem } : candidate,
                                    ),
                                  );
                                  setMessage({ type: "success", text: `${updatedItem.name} updated.` });
                                }}
                                onError={(errorMessage) => setMessage({ type: "error", text: errorMessage })}
                              />
                            </details>

                            <details className="group rounded-lg border border-slate-200 bg-white p-3">
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
              ))
            )}
          </div>
        </details>
      </div>
    </div>
  );
}
