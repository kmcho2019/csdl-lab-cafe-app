import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import React, { type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ItemsGrid } from "@/components/items/items-grid";

const baseItem = {
  id: "item-1",
  category: "Drinks",
  unit: "bottle",
  priceCents: 350,
  currency: "KRW",
  lowStockThreshold: 5,
};

describe("ItemsGrid", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  function renderWithClient(element: ReactElement) {
    return render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>);
  }

  it("renders items grouped by category with locale-aware pricing", () => {
    renderWithClient(
      <ItemsGrid
        locale="ko-KR"
        items={[
          { ...baseItem, name: "Cold Brew", currentStock: 3 },
          { ...baseItem, id: "item-2", name: "Sparkling Water", currentStock: 10 },
        ]}
      />,
    );

    expect(screen.getByText("Cold Brew")).toBeInTheDocument();
    expect(screen.getAllByText("₩350")).toHaveLength(2);
    expect(screen.getByText(/Low stock — please restock soon\./i)).toBeInTheDocument();
  });
});
