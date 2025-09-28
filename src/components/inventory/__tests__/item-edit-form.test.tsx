import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ItemEditForm } from "@/components/inventory/item-edit-form";
import type { InventoryItem } from "@/components/inventory/inventory-manager";

describe("ItemEditForm", () => {
  let queryClient: QueryClient;
  const fetchMock = vi.fn();
  const onSaved = vi.fn();
  const onError = vi.fn();

  const baseItem: InventoryItem = {
    id: "item-1",
    name: "Cold Brew",
    category: "Drinks",
    unit: "bottle",
    priceCents: 350,
    currency: "KRW",
    currentStock: 12,
    lowStockThreshold: 4,
    isActive: true,
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    fetchMock.mockReset();
    vi.spyOn(global, "fetch").mockImplementation(fetchMock as unknown as typeof fetch);
    onSaved.mockReset();
    onError.mockReset();
  });

  afterEach(() => {
    queryClient.clear();
    vi.restoreAllMocks();
  });

  function renderForm(item: InventoryItem, categories: string[] = ["Drinks", "Snacks"]) {
    return render(
      <QueryClientProvider client={queryClient}>
        <ItemEditForm
          item={item}
          categories={categories}
          currency="KRW"
          onSaved={onSaved}
          onError={onError}
        />
      </QueryClientProvider>,
    );
  }

  it("updates an item using an existing category", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          item: {
            ...baseItem,
            name: "Cold Brew Light",
            priceCents: 500,
            lowStockThreshold: 3,
            category: "Drinks",
          },
        }),
    });

    renderForm(baseItem);

    fireEvent.change(screen.getByLabelText(/^Name$/i), { target: { value: "Cold Brew Light" } });
    fireEvent.change(screen.getByLabelText(/Price/i), { target: { value: "500" } });
    fireEvent.change(screen.getByLabelText(/Low stock threshold/i), { target: { value: "3" } });

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({
      name: "Cold Brew Light",
      priceCents: 500,
      lowStockThreshold: 3,
      category: "Drinks",
    });

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onError).not.toHaveBeenCalled();
  });

  it("allows creating a brand new category", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          item: {
            ...baseItem,
            category: "Tea",
          },
        }),
    });

    renderForm({ ...baseItem, category: null }, ["Snacks"]);

    fireEvent.change(screen.getByLabelText(/Category/i), { target: { value: "__new__" } });
    fireEvent.change(screen.getByLabelText(/New category name/i), { target: { value: "Tea" } });

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.category).toBe("Tea");
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });
});

