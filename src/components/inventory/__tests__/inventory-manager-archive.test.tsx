import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InventoryManager } from "@/components/inventory/inventory-manager";
import type { InventoryItem } from "@/components/inventory/inventory-manager";

describe("InventoryManager archive/reactivate", () => {
  let queryClient: QueryClient;
  const fetchMock = vi.fn();

  const baseActiveItem: InventoryItem = {
    id: "item-active",
    name: "Trail Mix",
    category: "Snacks",
    unit: "bag",
    priceCents: 450,
    currency: "USD",
    currentStock: 0,
    lowStockThreshold: 2,
    isActive: true,
  };

  const baseArchivedItem: InventoryItem = {
    id: "item-archived",
    name: "Old Snack",
    category: "Snacks",
    unit: "bag",
    priceCents: 300,
    currency: "USD",
    currentStock: 0,
    lowStockThreshold: 0,
    isActive: false,
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
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    queryClient.clear();
    vi.restoreAllMocks();
  });

  function renderManager(items: InventoryItem[]) {
    return render(
      <QueryClientProvider client={queryClient}>
        <InventoryManager items={items} locale="en-US" currency="USD" />
      </QueryClientProvider>,
    );
  }

  it("requires stock=0 and typed confirmation to archive an item", async () => {
    fetchMock.mockImplementation((url) => {
      if (url === "/api/items/item-active/archive") {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              item: {
                ...baseActiveItem,
                isActive: false,
              },
            }),
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderManager([baseActiveItem, baseArchivedItem]);

    expect(screen.getByText("Archived items (1)")).toBeInTheDocument();

    const activeCard = screen.getByRole("heading", { name: baseActiveItem.name }).closest("div.rounded-xl") as HTMLElement | null;
    expect(activeCard).not.toBeNull();

    const archiveSummary = within(activeCard!).getByText("Archive");
    fireEvent.click(archiveSummary);
    const archiveDetails = archiveSummary.closest("details") as HTMLDetailsElement | null;
    if (archiveDetails) {
      archiveDetails.open = true;
    }

    const archiveButton = within(activeCard!).getByRole("button", { name: /archive item/i });
    expect(archiveButton).toBeDisabled();

    const confirmInput = within(activeCard!).getByLabelText(new RegExp(`Type\\s+${baseActiveItem.name}\\s+to confirm`, "i"));
    fireEvent.change(confirmInput, { target: { value: baseActiveItem.name } });

    expect(archiveButton).toBeEnabled();
    fireEvent.click(archiveButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/items/item-active/archive",
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(requestInit.body as string)).toEqual({ confirmName: baseActiveItem.name });

    await waitFor(() => expect(screen.getByText("Archived items (2)")).toBeInTheDocument());
  });

  it("disables archiving when current stock is not zero", () => {
    const itemWithStock: InventoryItem = {
      ...baseActiveItem,
      id: "item-with-stock",
      name: "Granola Bar",
      currentStock: 3,
    };

    renderManager([itemWithStock]);

    const activeCard = screen.getByRole("heading", { name: itemWithStock.name }).closest("div.rounded-xl") as HTMLElement | null;
    expect(activeCard).not.toBeNull();

    fireEvent.click(within(activeCard!).getByText("Archive"));
    const archiveDetails = within(activeCard!).getByText("Archive").closest("details") as HTMLDetailsElement | null;
    if (archiveDetails) {
      archiveDetails.open = true;
    }

    expect(within(activeCard!).getByRole("button", { name: /archive item/i })).toBeDisabled();
    expect(within(activeCard!).queryByLabelText(/type .* to confirm/i)).not.toBeInTheDocument();
    expect(within(activeCard!).getByText(/write off the remaining stock/i)).toBeInTheDocument();
  });

  it("reactivates an archived item from the archived list", async () => {
    fetchMock.mockImplementation((url) => {
      if (url === "/api/items/item-archived/reactivate") {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              item: {
                ...baseArchivedItem,
                isActive: true,
              },
            }),
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderManager([baseArchivedItem]);

    const archivedDetails = screen.getByText("Archived items (1)").closest("details");
    expect(archivedDetails).not.toBeNull();
    expect(archivedDetails).not.toHaveAttribute("open");

    fireEvent.click(screen.getByText("Archived items (1)"));
    (archivedDetails as HTMLDetailsElement).open = true;

    const archivedItemCard = screen.getByRole("heading", { name: baseArchivedItem.name }).closest("div.rounded-xl") as HTMLElement | null;
    expect(archivedItemCard).not.toBeNull();

    fireEvent.click(within(archivedItemCard!).getByRole("button", { name: /reactivate/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/items/item-archived/reactivate",
      expect.objectContaining({ method: "POST" }),
    );

    await waitFor(() => expect(screen.getByText("Archived items (0)")).toBeInTheDocument());
  });
});
