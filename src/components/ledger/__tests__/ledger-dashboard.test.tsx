import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React, { type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LedgerDashboard } from "@/components/ledger/ledger-dashboard";

describe("LedgerDashboard", () => {
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

  it("loads the balance summary and creates a signed manual entry", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.startsWith("/api/ledger/summary")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              window: "30d",
              startDate: "2025-01-01T00:00:00.000Z",
              endDate: "2025-01-30T23:59:59.999Z",
              currentBalanceCents: 1000,
              startingBalanceCents: 900,
              series: { labels: ["2025-01-01"], values: [900] },
            }),
        });
      }

      if (url === "/api/ledger" && init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ entry: { id: "le-1" } }),
        });
      }

      throw new Error(`Unexpected fetch url: ${url}`);
    });

    renderWithClient(<LedgerDashboard locale="en-US" currency="USD" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/ledger/summary")));
    expect(screen.getByText(/current balance/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Type$/i), { target: { value: "debit" } });
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: "123" } });
    fireEvent.change(screen.getByLabelText(/category/i), { target: { value: "OTHER" } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: "Shipping fee" } });

    fireEvent.click(screen.getByRole("button", { name: /create entry/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/ledger", expect.any(Object)));
    const ledgerCall = fetchMock.mock.calls.find(([url]) => url === "/api/ledger") as [string, RequestInit];
    const body = JSON.parse(ledgerCall[1].body as string);
    expect(body).toEqual({ description: "Shipping fee", amountCents: -123, category: "OTHER" });
  });
});
