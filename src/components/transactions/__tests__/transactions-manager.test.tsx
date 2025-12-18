import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TransactionsManager } from "@/components/transactions/transactions-manager";

describe("TransactionsManager", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.spyOn(global, "fetch").mockImplementation(fetchMock as unknown as typeof fetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads the first page and supports pagination", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.startsWith("/api/admin/transactions?")) {
        if (url.includes("cursor=")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                nextCursor: null,
                transactions: [
                  {
                    id: "c2",
                    createdAt: "2025-01-02T12:10:00.000Z",
                    reversedAt: null,
                    settlementId: null,
                    user: { id: "u1", name: "Alex", email: "alex@example.com" },
                    item: { id: "item-2", name: "Soda" },
                    quantity: 1,
                    unitPriceCents: 200,
                    currency: "USD",
                    chargedCents: 200,
                    stockDeltaUnits: -1,
                    owedDeltaCents: 200,
                    reversal: null,
                  },
                ],
              }),
          });
        }

        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              nextCursor: "c1",
              transactions: [
                {
                  id: "c1",
                  createdAt: "2025-01-02T12:00:00.000Z",
                  reversedAt: null,
                  settlementId: null,
                  user: { id: "u1", name: "Alex", email: "alex@example.com" },
                  item: { id: "item-1", name: "Cold Brew" },
                  quantity: 2,
                  unitPriceCents: 350,
                  currency: "USD",
                  chargedCents: 700,
                  stockDeltaUnits: -2,
                  owedDeltaCents: 700,
                  reversal: null,
                },
              ],
            }),
        });
      }

      throw new Error(`Unexpected fetch url: ${url}`);
    });

    render(<TransactionsManager locale="en-US" currency="USD" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("includeReversed=true")));
    expect(screen.getByText("Cold Brew")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    await waitFor(() => expect(screen.getByText("Soda")).toBeInTheDocument());
  });
});

