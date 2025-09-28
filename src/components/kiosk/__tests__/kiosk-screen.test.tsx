import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KioskScreen } from "@/components/kiosk/kiosk-screen";

describe("KioskScreen", () => {
  let queryClient: QueryClient;
  const fetchMock = vi.fn();

  const users = [
    { id: "user-1", label: "Casey (casey@example.com)" },
    { id: "user-2", label: "Alex (alex@example.com)" },
  ];

  const items = [
    {
      id: "item-1",
      name: "Cold Brew",
      category: "Drinks",
      unit: "bottle",
      priceCents: 350,
      currency: "KRW",
      currentStock: 10,
      lowStockThreshold: 2,
    },
    {
      id: "item-2",
      name: "Energy Bar",
      category: "Snacks",
      unit: "bar",
      priceCents: 250,
      currency: "KRW",
      currentStock: 20,
      lowStockThreshold: 4,
    },
  ];

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

  function renderKiosk() {
    return render(
      <QueryClientProvider client={queryClient}>
        <KioskScreen users={users} items={items} />
      </QueryClientProvider>,
    );
  }

  it("adds items to the cart and posts checkout", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ totalCents: 600, currency: "KRW" }),
    });

    renderKiosk();

    fireEvent.change(screen.getByLabelText(/Select member/i), { target: { value: "user-1" } });
    fireEvent.click(screen.getByText(/Cold Brew/i));
    fireEvent.click(screen.getByText(/Energy Bar/i));

    fireEvent.click(screen.getByRole("button", { name: /record purchase/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({
      userId: "user-1",
      cart: [
        { itemId: "item-1", quantity: 1 },
        { itemId: "item-2", quantity: 1 },
      ],
    });

    await waitFor(() => expect(screen.getByText(/Recorded purchase/)).toBeInTheDocument());
  });
});

