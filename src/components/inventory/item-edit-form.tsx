"use client";

import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import type { InventoryItem } from "@/components/inventory/inventory-manager";

const NEW_CATEGORY_VALUE = "__new__";

type ItemEditFormProps = {
  item: InventoryItem;
  categories: string[];
  currency: string;
  onSaved: (item: InventoryItem) => void;
  onError: (message: string) => void;
};

export function ItemEditForm({ item, categories, currency, onSaved, onError }: ItemEditFormProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>(item.category ?? "");
  const [newCategory, setNewCategory] = useState<string>("");

  useEffect(() => {
    setSelectedCategory(item.category ?? "");
    setNewCategory("");
  }, [item.id, item.category]);

  const categoryOptions = useMemo(() => {
    const base = new Set<string>(categories.filter(Boolean));
    if (item.category) {
      base.add(item.category);
    }
    return Array.from(base).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [categories, item.category]);

  const updateItem = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const response = await fetch(`/api/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error?.message ?? "Unable to update item");
      }

      return response.json() as Promise<{ item: InventoryItem }>;
    },
    onSuccess: (data) => {
      onSaved({
        ...data.item,
        category: data.item.category ?? null,
        unit: data.item.unit ?? null,
        lowStockThreshold: data.item.lowStockThreshold ?? 0,
        isActive: data.item.isActive ?? true,
      });
      setSelectedCategory(data.item.category ?? "");
      setNewCategory("");
    },
    onError: (error: unknown) => {
      onError(error instanceof Error ? error.message : "Update failed");
    },
  });

  return (
    <form
      key={`${item.id}-${item.name}-${item.priceCents}-${item.category ?? ""}-${item.unit ?? ""}-${item.lowStockThreshold}`}
      className="mt-3 flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);

        const name = formData.get("name")?.toString().trim() ?? "";
        const priceRaw = formData.get("priceCents")?.toString().trim() ?? "";
        const unit = formData.get("unit")?.toString().trim() ?? "";
        const lowStockRaw = formData.get("lowStockThreshold")?.toString().trim() ?? "";

        const priceCents = Number(priceRaw);
        const lowStockThreshold = lowStockRaw ? Number(lowStockRaw) : 0;

        const finalCategory =
          selectedCategory === NEW_CATEGORY_VALUE
            ? newCategory.trim()
            : selectedCategory.trim();

        if (!name) {
          onError("Name is required.");
          return;
        }

        if (!Number.isFinite(priceCents) || priceCents <= 0) {
          onError("Price must be a positive number in minor units.");
          return;
        }

        if (!Number.isFinite(lowStockThreshold) || lowStockThreshold < 0) {
          onError("Low stock threshold must be zero or positive.");
          return;
        }

        if (selectedCategory === NEW_CATEGORY_VALUE && !finalCategory) {
          onError("Enter a category name when adding a new category.");
          return;
        }

        updateItem.mutate({
          name,
          priceCents,
          unit: unit || undefined,
          lowStockThreshold,
          category: finalCategory ? finalCategory : null,
        });
      }}
    >
      <label className="text-xs font-medium text-slate-500">
        Name
        <input
          name="name"
          type="text"
          defaultValue={item.name}
          required
          className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-sm"
        />
      </label>
      <label className="text-xs font-medium text-slate-500">
        Price ({currency} minor units)
        <input
          name="priceCents"
          type="number"
          min={1}
          defaultValue={item.priceCents}
          required
          className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-sm"
        />
      </label>
      <label className="text-xs font-medium text-slate-500">
        Category
        <select
          className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-sm"
          value={selectedCategory}
          onChange={(event) => {
            const value = event.target.value;
            setSelectedCategory(value);
            if (value !== NEW_CATEGORY_VALUE) {
              setNewCategory("");
            }
          }}
        >
          <option value="">Uncategorized</option>
          {categoryOptions.map((categoryOption) => (
            <option key={categoryOption} value={categoryOption}>
              {categoryOption}
            </option>
          ))}
          <option value={NEW_CATEGORY_VALUE}>Add new category…</option>
        </select>
      </label>
      {selectedCategory === NEW_CATEGORY_VALUE && (
        <label className="text-xs font-medium text-slate-500">
          New category name
          <input
            type="text"
            value={newCategory}
            onChange={(event) => setNewCategory(event.target.value)}
            className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-sm"
          />
        </label>
      )}
      <label className="text-xs font-medium text-slate-500">
        Unit (optional)
        <input
          name="unit"
          type="text"
          defaultValue={item.unit ?? ""}
          className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-sm"
        />
      </label>
      <label className="text-xs font-medium text-slate-500">
        Low stock threshold
        <input
          name="lowStockThreshold"
          type="number"
          min={0}
          defaultValue={item.lowStockThreshold}
          className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={updateItem.isPending}
        className="mt-2 rounded bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {updateItem.isPending ? "Saving..." : "Save changes"}
      </button>
    </form>
  );
}
