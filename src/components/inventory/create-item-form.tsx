"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import type { InventoryItem } from "@/components/inventory/inventory-manager";

type Message = { type: "success" | "error"; text: string } | null;

type CreateItemFormProps = {
  defaultCurrency: string;
  onCreated: (item: InventoryItem) => void;
};

export function CreateItemForm({ defaultCurrency, onCreated }: CreateItemFormProps) {
  const [message, setMessage] = useState<Message>(null);

  const createItem = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const response = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error?.message ?? "Unable to create item");
      }

      return response.json() as Promise<{ item: InventoryItem }>;
    },
    onSuccess: (data) => {
      const normalized = {
        ...data.item,
        category: data.item.category ?? null,
        unit: data.item.unit ?? null,
        lowStockThreshold: data.item.lowStockThreshold ?? 0,
        isActive: data.item.isActive ?? true,
      } as InventoryItem;

      onCreated(normalized);
      setMessage({ type: "success", text: `Added ${data.item.name} to the menu.` });
    },
    onError: (error: unknown) => {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Item creation failed" });
    },
  });

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Add new item</h2>
      <p className="mt-1 text-sm text-slate-600">
        Provide prices in minor units ({defaultCurrency}). Initial stock is optional and records a restock movement automatically.
      </p>

      {message && (
        <div
          className={`mt-4 rounded-lg border px-4 py-3 text-sm ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}
        >
          {message.text}
        </div>
      )}

      <form
        className="mt-4 grid gap-4 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const formData = new FormData(form);

          setMessage(null);

          const name = formData.get("name")?.toString().trim() ?? "";
          const category = formData.get("category")?.toString().trim() ?? "";
          const unit = formData.get("unit")?.toString().trim() ?? "";
          const priceRaw = formData.get("priceCents")?.toString().trim() ?? "";
          const stockRaw = formData.get("currentStock")?.toString().trim() ?? "";
          const lowStockRaw = formData.get("lowStockThreshold")?.toString().trim() ?? "";

          const priceCents = Number(priceRaw);
          const currentStock = stockRaw ? Number(stockRaw) : 0;
          const lowStockThreshold = lowStockRaw ? Number(lowStockRaw) : 0;

          if (!Number.isFinite(priceCents) || priceCents <= 0) {
            setMessage({ type: "error", text: "Price must be a positive number in minor units." });
            return;
          }

          if (!Number.isFinite(currentStock) || currentStock < 0) {
            setMessage({ type: "error", text: "Initial stock must be zero or a positive integer." });
            return;
          }

          if (!Number.isFinite(lowStockThreshold) || lowStockThreshold < 0) {
            setMessage({ type: "error", text: "Low stock threshold must be zero or positive." });
            return;
          }

          createItem.mutate(
            {
              name,
              category: category || undefined,
              unit: unit || undefined,
              priceCents,
              currentStock,
              lowStockThreshold,
              currency: defaultCurrency,
            },
            {
              onSuccess: () => form.reset(),
            },
          );
        }}
      >
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
          Name
          <input
            name="name"
            type="text"
            required
            className="rounded border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
          Category (optional)
          <input
            name="category"
            type="text"
            className="rounded border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
          Unit (optional)
          <input
            name="unit"
            type="text"
            placeholder="bottle, can, bar..."
            className="rounded border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
          Price (minor units)
          <input
            name="priceCents"
            type="number"
            min={1}
            required
            className="rounded border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
          Initial stock
          <input
            name="currentStock"
            type="number"
            min={0}
            defaultValue={0}
            className="rounded border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
          Low stock threshold
          <input
            name="lowStockThreshold"
            type="number"
            min={0}
            defaultValue={0}
            className="rounded border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none"
          />
        </label>
        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={createItem.isPending}
            className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {createItem.isPending ? "Creating..." : "Add item"}
          </button>
        </div>
      </form>
    </section>
  );
}
