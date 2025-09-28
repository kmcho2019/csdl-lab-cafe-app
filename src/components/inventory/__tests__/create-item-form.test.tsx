import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreateItemForm } from "@/components/inventory/create-item-form";
import type { InventoryItem } from "@/components/inventory/inventory-manager";

describe("CreateItemForm", () => {
  const onCreated = vi.fn();
  let queryClient: QueryClient;
  const fetchMock = vi.fn();

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          item: {
            id: "item-123",
            name: "Trail Mix",
            category: "Snacks",
            unit: "bag",
            priceCents: 450,
            currency: "KRW",
            currentStock: 5,
            lowStockThreshold: 2,
            isActive: true,
          } satisfies InventoryItem,
        }),
    });

    vi.spyOn(global, "fetch").mockImplementation(fetchMock as unknown as typeof fetch);
  });

  afterEach(() => {
    queryClient.clear();
    vi.restoreAllMocks();
    onCreated.mockReset();
  });

  function renderWithClient() {
    return render(
      <QueryClientProvider client={queryClient}>
        <CreateItemForm defaultCurrency="KRW" onCreated={onCreated} />
      </QueryClientProvider>,
    );
  }

  it("submits form data and calls onCreated", async () => {
    renderWithClient();

    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: "Trail Mix" } });
    fireEvent.change(screen.getByLabelText(/Price/i), { target: { value: "450" } });
    fireEvent.change(screen.getByLabelText(/Initial stock/i), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText(/Low stock threshold/i), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText(/Category/i), { target: { value: "Snacks" } });
    fireEvent.change(screen.getByLabelText(/Unit \(optional\)/i), { target: { value: "bag" } });

    fireEvent.click(screen.getByRole("button", { name: /add item/i }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/items",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      }),
    );

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({
      name: "Trail Mix",
      priceCents: 450,
      currentStock: 5,
      lowStockThreshold: 2,
      category: "Snacks",
      unit: "bag",
      currency: "KRW",
    });
  });
});
