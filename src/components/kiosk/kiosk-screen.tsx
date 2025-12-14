"use client";

import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { formatCurrency } from "@/lib/currency";

type KioskUser = {
  id: string;
  label: string;
};

type KioskItem = {
  id: string;
  name: string;
  category: string;
  unit: string | null;
  priceCents: number;
  currency: string;
  currentStock: number;
  lowStockThreshold: number;
};

type CartLine = {
  itemId: string;
  quantity: number;
};

type KioskScreenProps = {
  items: KioskItem[];
  users: KioskUser[];
  currentUser: KioskUser;
  allowUserSelection: boolean;
};

type Message = { type: "success" | "error"; text: string } | null;

export function KioskScreen({ users, items, currentUser, allowUserSelection }: KioskScreenProps) {
  const [selectedUserId, setSelectedUserId] = useState<string>(
    allowUserSelection ? "" : currentUser.id,
  );
  const [cart, setCart] = useState<CartLine[]>([]);
  const [message, setMessage] = useState<Message>(null);

  const groupedItems = useMemo(() => {
    return items.reduce<Record<string, KioskItem[]>>((acc, item) => {
      const key = item.category ?? "Uncategorized";
      acc[key] = acc[key] ?? [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [items]);

  const totalCents = useMemo(() => {
    return cart.reduce((sum, line) => {
      const item = items.find((candidate) => candidate.id === line.itemId);
      if (!item) {
        return sum;
      }
      return sum + item.priceCents * line.quantity;
    }, 0);
  }, [cart, items]);

  const addToCart = (itemId: string) => {
    setCart((prev) => {
      const existing = prev.find((line) => line.itemId === itemId);
      if (existing) {
        return prev.map((line) => (line.itemId === itemId ? { ...line, quantity: line.quantity + 1 } : line));
      }
      return [...prev, { itemId, quantity: 1 }];
    });
  };

  const decrementItem = (itemId: string) => {
    setCart((prev) => {
      return prev
        .map((line) => (line.itemId === itemId ? { ...line, quantity: Math.max(line.quantity - 1, 0) } : line))
        .filter((line) => line.quantity > 0);
    });
  };

  const clearCart = () => setCart([]);

  const checkout = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/kiosk/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUserId,
          cart: cart.map((line) => ({ itemId: line.itemId, quantity: line.quantity })),
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error?.message ?? "Unable to record purchase");
      }

      return response.json() as Promise<{ totalCents: number; currency: string }>;
    },
    onSuccess: (payload) => {
      setMessage({
        type: "success",
        text: `Recorded purchase for ${formatCurrency(payload.totalCents, payload.currency)}.`,
      });
      clearCart();
    },
    onError: (error: unknown) => {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Checkout failed" });
    },
  });

  const disabled = !cart.length || !selectedUserId || checkout.isPending;

  return (
    <div className="space-y-6">
      <header className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Kiosk Mode</h1>
        <p className="mt-2 text-sm text-slate-600">
          Choose a member, add items to the cart, and record the purchase in one tap.
        </p>
      </header>

      {message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}
        >
          {message.text}
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {allowUserSelection ? (
          <>
            <h2 className="text-lg font-semibold text-slate-900" id="kiosk-member-heading">
              Select member
            </h2>
            <label htmlFor="kiosk-member" className="sr-only">
              Select member
            </label>
            <select
              id="kiosk-member"
              aria-labelledby="kiosk-member-heading"
              className="mt-3 w-full rounded border border-slate-200 px-3 py-2 text-sm focus:border-brand focus:outline-none"
              value={selectedUserId}
              onChange={(event) => {
                setSelectedUserId(event.target.value);
                setMessage(null);
              }}
            >
              <option value="">Choose a member…</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.label}
                </option>
              ))}
            </select>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-slate-900">Purchasing for</h2>
            <p className="mt-2 text-sm text-slate-600">
              {currentUser.label}
            </p>
            <p className="mt-1 text-xs text-slate-500">Only admins can charge items to someone else.</p>
          </>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2 space-y-4">
          {Object.entries(groupedItems).map(([category, categoryItems]) => (
            <div key={category} className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{category}</h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {categoryItems.map((item) => {
                  const lowStock = item.currentStock <= item.lowStockThreshold;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setMessage(null);
                        addToCart(item.id);
                      }}
                      className={`flex h-full flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-brand hover:shadow ${
                        checkout.isPending ? "cursor-not-allowed opacity-70" : ""
                      }`}
                      disabled={checkout.isPending}
                    >
                      <div className="space-y-2">
                        <h3 className="text-base font-semibold text-slate-900">{item.name}</h3>
                        <p className="text-sm text-slate-600">
                          {formatCurrency(item.priceCents, item.currency)}
                          {item.unit ? ` / ${item.unit}` : ""}
                        </p>
                        <p className="text-xs text-slate-500">
                          {item.currentStock} in stock
                          {lowStock ? " · Low" : ""}
                        </p>
                      </div>
                      <div className="text-center text-sm font-semibold text-brand">Add to cart</div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Cart</h2>
          <div className="mt-3 space-y-3">
            {cart.length === 0 && <p className="text-sm text-slate-500">No items yet. Tap an item to add it.</p>}
            {cart.map((line) => {
              const item = items.find((candidate) => candidate.id === line.itemId);
              if (!item) {
                return null;
              }

              const lineTotal = item.priceCents * line.quantity;

              return (
                <div key={line.itemId} className="flex items-center justify-between gap-3 rounded border border-slate-200 p-3 text-sm">
                  <div>
                    <div className="font-semibold text-slate-900">{item.name}</div>
                    <div className="text-xs text-slate-500">
                      {formatCurrency(item.priceCents, item.currency)} × {line.quantity}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => decrementItem(line.itemId)}
                      className="h-7 w-7 rounded-full bg-slate-100 text-center text-base font-semibold text-slate-700"
                    >
                      –
                    </button>
                    <span className="w-6 text-center text-sm font-semibold text-slate-700">{line.quantity}</span>
                    <button
                      type="button"
                      onClick={() => addToCart(line.itemId)}
                      className="h-7 w-7 rounded-full bg-brand text-center text-base font-semibold text-white"
                    >
                      +
                    </button>
                  </div>
                  <div className="text-sm font-semibold text-slate-900">
                    {formatCurrency(lineTotal, item.currency)}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between text-sm text-slate-700">
              <span>Total</span>
              <span className="text-base font-semibold text-slate-900">
                {formatCurrency(totalCents, items[0]?.currency ?? "KRW")}
              </span>
            </div>
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                setMessage(null);
                checkout.mutate();
              }}
              className="mt-4 w-full rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {checkout.isPending ? "Recording…" : "Record purchase"}
            </button>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  clearCart();
                  setMessage(null);
                }}
                className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3 text-xs font-semibold text-slate-500 hover:border-red-200 hover:text-red-600"
              >
                Clear cart
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
