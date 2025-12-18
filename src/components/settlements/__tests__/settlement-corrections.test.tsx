import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React, { type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SettlementCorrections } from "@/components/settlements/settlement-corrections";

describe("SettlementCorrections", () => {
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
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    queryClient.clear();
    vi.restoreAllMocks();
  });

  function renderWithClient(element: ReactElement) {
    return render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>);
  }

  it("loads settlement consumptions and reverses one", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.startsWith("/api/settlements/settle-1/consumptions")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              settlement: {
                id: "settle-1",
                status: "DRAFT",
                startDate: "2025-01-01T00:00:00.000Z",
                endDate: "2025-01-31T23:59:59.999Z",
              },
              consumptions: [
                {
                  id: "c1",
                  createdAt: "2025-01-02T12:00:00.000Z",
                  user: { id: "u1", name: "Alex", email: "alex@example.com" },
                  item: { id: "item-1", name: "Cold Brew" },
                  quantity: 1,
                  priceAtTxCents: 350,
                  currency: "USD",
                  settlementId: null,
                  reversedAt: null,
                },
              ],
            }),
        });
      }

      if (url === "/api/consumptions/c1/reverse") {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              consumption: { id: "c1", reversedAt: "2025-01-02T12:05:00.000Z" },
              item: { id: "item-1", currentStock: 10 },
            }),
        });
      }

      throw new Error(`Unexpected fetch url: ${url}`);
    });

    renderWithClient(<SettlementCorrections settlementId="settle-1" />);

    const summary = screen.getByText(/corrections/i);
    fireEvent.click(summary);
    const details = summary.closest("details") as HTMLDetailsElement | null;
    if (details) {
      details.open = true;
      fireEvent(details, new Event("toggle"));
    }

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Cold Brew")).toBeInTheDocument();

    fireEvent.click(screen.getByText(/^Reverse$/));
    fireEvent.change(screen.getByLabelText(/note/i), { target: { value: "Wrong member" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm reverse/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const reverseRequestInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(JSON.parse(reverseRequestInit.body as string)).toEqual({ note: "Wrong member" });

    await waitFor(() => expect(screen.getByText("Reversed")).toBeInTheDocument());
  });
});
