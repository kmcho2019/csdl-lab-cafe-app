import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/guards", () => ({
  requireAdmin: vi.fn(),
}));

vi.mock("@/server/db/client", () => ({
  prisma: {
    item: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { POST as createPurchaseOrder } from "@/app/api/purchase-orders/route";
import { requireAdmin } from "@/server/auth/guards";
import { prisma } from "@/server/db/client";

const requireAdminMock = vi.mocked(requireAdmin);
const prismaMock = vi.mocked(prisma, { deep: true });

describe("POST /api/purchase-orders", () => {
  it("rejects non-ASCII comments", async () => {
    requireAdminMock.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN", isActive: true } } as never);

    const response = await createPurchaseOrder(
      new Request("http://localhost/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorName: "Test",
          comment: "안녕",
          lines: [{ itemId: "item-1", quantity: 1, unitCostCents: 100 }],
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "INVALID_BODY" } });
  });

  it("rejects duplicate item lines", async () => {
    requireAdminMock.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN", isActive: true } } as never);

    const response = await createPurchaseOrder(
      new Request("http://localhost/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorName: "Test",
          lines: [
            { itemId: "item-1", quantity: 1, unitCostCents: 100 },
            { itemId: "item-1", quantity: 2, unitCostCents: 100 },
          ],
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "DUPLICATE_ITEM" } });
  });

  it("returns 404 when items are missing or archived", async () => {
    requireAdminMock.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN", isActive: true } } as never);
    prismaMock.item.findMany.mockResolvedValue([] as never);

    const response = await createPurchaseOrder(
      new Request("http://localhost/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorName: "Test",
          lines: [{ itemId: "item-1", quantity: 1, unitCostCents: 100 }],
        }),
      }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "ITEM_NOT_FOUND" } });
  });

  it("creates a purchase order, restocks items, and debits the ledger", async () => {
    requireAdminMock.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN", isActive: true } } as never);

    prismaMock.item.findMany.mockResolvedValue([
      { id: "item-1", name: "Chips", currency: "USD" },
      { id: "item-2", name: "Soda", currency: "USD" },
    ] as never);

    const poCreate = vi.fn().mockResolvedValue({
      id: "po-1",
      vendorName: "Coupang",
      purchaseChannel: "online",
      receiptPath: "s3://bucket/receipt.pdf",
      comment: "bulk snacks",
      miscCostCents: 200,
      miscComment: "shipping",
      status: "RECEIVED",
      orderedAt: new Date("2025-01-01T00:00:00.000Z"),
      receivedAt: new Date("2025-01-01T00:00:00.000Z"),
      totalCostCents: 700,
      createdAt: new Date("2025-01-01T00:00:00.000Z"),
      items: [
        { id: "li-1", itemId: "item-1", quantity: 2, unitCostCents: 100, item: { id: "item-1", name: "Chips" } },
        { id: "li-2", itemId: "item-2", quantity: 1, unitCostCents: 300, item: { id: "item-2", name: "Soda" } },
      ],
    });

    const itemUpdate = vi.fn();
    const stockMoveCreate = vi.fn();
    const ledgerCreate = vi.fn();
    const auditCreate = vi.fn();

    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        purchaseOrder: { create: poCreate },
        item: { update: itemUpdate },
        stockMovement: { create: stockMoveCreate },
        ledgerEntry: { create: ledgerCreate },
        auditLog: { create: auditCreate },
      }),
    );

    const response = await createPurchaseOrder(
      new Request("http://localhost/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorName: "Coupang",
          purchaseChannel: "online",
          receiptPath: "s3://bucket/receipt.pdf",
          comment: "bulk snacks",
          miscCostCents: 200,
          miscComment: "shipping",
          lines: [
            { itemId: "item-1", quantity: 2, unitCostCents: 100 },
            { itemId: "item-2", quantity: 1, unitCostCents: 300 },
          ],
        }),
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      purchaseOrder: {
        id: "po-1",
        vendorName: "Coupang",
        totalCostCents: 700,
        items: [
          expect.objectContaining({ itemId: "item-1", quantity: 2, unitCostCents: 100 }),
          expect.objectContaining({ itemId: "item-2", quantity: 1, unitCostCents: 300 }),
        ],
      },
    });

    expect(stockMoveCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          relatedPOId: "po-1",
          type: "RESTOCK",
        }),
      }),
    );

    expect(ledgerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amountCents: -700,
          category: "PURCHASE",
          purchaseOrderId: "po-1",
          userId: "admin-1",
        }),
      }),
    );

    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "PURCHASE_ORDER_RECEIVED",
          entity: "PurchaseOrder",
          entityId: "po-1",
          actorId: "admin-1",
        }),
      }),
    );
  });
});

