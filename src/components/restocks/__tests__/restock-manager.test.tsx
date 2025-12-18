import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React, { type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RestockManager } from "@/components/restocks/restock-manager";

describe("RestockManager", () => {
  let queryClient: QueryClient;
  const fetchMock = vi.fn();

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    fetchMock.mockReset();
    vi.spyOn(global, "fetch").mockImplementation(fetchMock as unknown as typeof fetch);
  });

  afterEach(() => {
    queryClient.clear();
    vi.restoreAllMocks();
  });

  function renderWithClient(element: ReactElement) {
    return render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>);
  }

  it("warns on low/negative margin and submits a purchase order payload", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          purchaseOrder: {
            id: "po-1",
            vendorName: "Coupang",
            purchaseChannel: "online",
            receiptPath: "",
            comment: "",
            miscCostCents: 0,
            miscComment: "",
            status: "RECEIVED",
            createdAt: "2025-01-01T00:00:00.000Z",
            totalCostCents: 100,
            createdBy: null,
            items: [{ id: "li-1", itemId: "item-1", itemName: "Chips", quantity: 1, unitCostCents: 100 }],
          },
        }),
    });

    renderWithClient(
      <RestockManager
        currency="USD"
        locale="en-US"
        items={[
          { id: "item-1", name: "Chips", category: "Snacks", priceCents: 100, currency: "USD", currentStock: 0 },
          { id: "item-2", name: "Soda", category: "Drinks", priceCents: 200, currency: "USD", currentStock: 0 },
        ]}
        initialPurchaseOrders={[]}
      />,
    );

    fireEvent.change(screen.getByLabelText(/vendor/i), { target: { value: "Coupang" } });
    fireEvent.change(screen.getByLabelText(/unit cost/i), { target: { value: "100" } });

    expect(screen.getByText(/at\/above the selling price/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /record restock/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/purchase-orders");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      vendorName: "Coupang",
      lines: [{ itemId: "item-1", quantity: 1, unitCostCents: 100 }],
    });

    await waitFor(() => expect(screen.getByText(/restock recorded/i)).toBeInTheDocument());
  });
});
