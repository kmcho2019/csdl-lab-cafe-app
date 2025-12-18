import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React, { type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SettlementPayments } from "@/components/settlements/settlement-payments";

describe("SettlementPayments", () => {
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

  it("tracks paid status and finalizes when everyone is paid", async () => {
    const onSettlementUpdated = vi.fn();

    let paymentsGetCount = 0;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/settlements/settle-1/payments" && (!init || !init.method || init.method === "GET")) {
        paymentsGetCount += 1;
        const isPaid = paymentsGetCount > 1;
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              settlement: {
                id: "settle-1",
                number: 7,
                startDate: "2025-01-01T00:00:00.000Z",
                endDate: "2025-01-31T23:59:59.999Z",
                status: "BILLED",
                notes: "",
              },
              totals: { dueCents: 500, paidCents: isPaid ? 500 : 0 },
              lines: [
                {
                  userId: "u1",
                  userName: "Alex",
                  userEmail: "alex@example.com",
                  itemCount: 3,
                  totalCents: 500,
                  paidCents: isPaid ? 500 : 0,
                  isPaid,
                },
              ],
            }),
        });
      }

      if (url === "/api/settlements/settle-1/payments" && init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              settlement: {
                id: "settle-1",
                number: 7,
                startDate: "2025-01-01T00:00:00.000Z",
                endDate: "2025-01-31T23:59:59.999Z",
                status: "BILLED",
                notes: "",
                createdAt: "2025-02-01T00:00:00.000Z",
                finalizedAt: null,
                counts: { consumptions: 10, lines: 1, payments: 1 },
              },
            }),
        });
      }

      if (url === "/api/settlements/settle-1/complete" && init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              settlement: {
                id: "settle-1",
                number: 7,
                startDate: "2025-01-01T00:00:00.000Z",
                endDate: "2025-01-31T23:59:59.999Z",
                status: "FINALIZED",
                notes: "",
                createdAt: "2025-02-01T00:00:00.000Z",
                finalizedAt: "2025-02-02T00:00:00.000Z",
                counts: { consumptions: 10, lines: 1, payments: 1 },
              },
            }),
        });
      }

      throw new Error(`Unexpected fetch url: ${url}`);
    });

    renderWithClient(
      <SettlementPayments
        settlementId="settle-1"
        locale="en-US"
        currency="USD"
        onSettlementUpdated={onSettlementUpdated}
      />,
    );

    const summary = screen.getByText(/payment tracking/i);
    fireEvent.click(summary);
    const details = summary.closest("details") as HTMLDetailsElement | null;
    if (details) {
      details.open = true;
      fireEvent(details, new Event("toggle"));
    }

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/settlements/settle-1/payments"));
    const finalize = screen.getByRole("button", { name: /finalize settlement/i }) as HTMLButtonElement;
    expect(finalize.disabled).toBe(true);

    fireEvent.click(screen.getByLabelText(/mark alex@example\.com paid/i));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/settlements/settle-1/payments", expect.any(Object)));

    await waitFor(() => expect(screen.getByText(/all paid/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /finalize settlement/i })).not.toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /finalize settlement/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/settlements/settle-1/complete", expect.any(Object)));
    await waitFor(() => expect(onSettlementUpdated).toHaveBeenCalledWith(expect.objectContaining({ status: "FINALIZED" })));
  });
});
