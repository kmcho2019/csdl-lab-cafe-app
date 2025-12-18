import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React, { type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ItemsGrid } from "@/components/items/items-grid";

describe("ItemsGrid undo", () => {
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

  it("records and then reverses the most recent consumption", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/consumptions") {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              consumption: {
                id: "c1",
                priceAtTxCents: 350,
                currency: "USD",
                quantity: 1,
              },
              newStock: 2,
            }),
        });
      }

      if (url === "/api/consumptions/c1/reverse") {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              consumption: { id: "c1", reversedAt: "2025-01-01T00:00:00.000Z" },
              item: { id: "item-1", currentStock: 3 },
            }),
        });
      }

      throw new Error(`Unexpected fetch url: ${url}`);
    });

    renderWithClient(
      <ItemsGrid
        locale="en-US"
        items={[
          {
            id: "item-1",
            name: "Cold Brew",
            category: "Drinks",
            unit: "bottle",
            priceCents: 350,
            currency: "USD",
            currentStock: 3,
            lowStockThreshold: 0,
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /take one/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/enjoy!/i)).toBeInTheDocument();
    expect(screen.getByText(/2 bottle/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Undo"));
    fireEvent.change(screen.getByLabelText(/note/i), { target: { value: "Mis-click" } });
    fireEvent.click(screen.getByRole("button", { name: /reverse transaction/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const secondRequestInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/consumptions/c1/reverse");
    expect(JSON.parse(secondRequestInit.body as string)).toEqual({ note: "Mis-click" });

    await waitFor(() => expect(screen.getByText(/3 bottle/i)).toBeInTheDocument());
  });
});

