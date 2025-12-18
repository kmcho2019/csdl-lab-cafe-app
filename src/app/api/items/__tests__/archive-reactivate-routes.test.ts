import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/guards", () => ({
  requireAdmin: vi.fn(),
  requireSession: vi.fn(),
}));

vi.mock("@/server/db/client", () => ({
  prisma: {
    $transaction: vi.fn(),
    item: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

import { GET as listItems } from "@/app/api/items/route";
import { POST as archiveItem } from "@/app/api/items/[id]/archive/route";
import { POST as reactivateItem } from "@/app/api/items/[id]/reactivate/route";
import { POST as restockItem } from "@/app/api/items/[id]/restock/route";
import { requireAdmin, requireSession } from "@/server/auth/guards";
import { prisma } from "@/server/db/client";

const requireAdminMock = vi.mocked(requireAdmin);
const requireSessionMock = vi.mocked(requireSession);
const prismaMock = vi.mocked(prisma, { deep: true });

describe("item archive/reactivate routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    requireAdminMock.mockResolvedValue({ user: { id: "admin-1" } } as never);
  });

  it("prevents archiving when stock is not zero", async () => {
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        item: {
          findUnique: vi.fn().mockResolvedValue({
            id: "item-1",
            name: "Latte",
            category: null,
            unit: null,
            priceCents: 400,
            currency: "USD",
            currentStock: 2,
            lowStockThreshold: 0,
            isActive: true,
          }),
        },
      }),
    );

    const response = await archiveItem(
      new Request("http://localhost/api/items/item-1/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmName: "Latte" }),
      }),
      { params: Promise.resolve({ id: "item-1" }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "STOCK_NOT_ZERO" },
    });
  });

  it("requires the exact item name to archive", async () => {
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        item: {
          findUnique: vi.fn().mockResolvedValue({
            id: "item-1",
            name: "Latte",
            category: null,
            unit: null,
            priceCents: 400,
            currency: "USD",
            currentStock: 0,
            lowStockThreshold: 0,
            isActive: true,
          }),
        },
      }),
    );

    const response = await archiveItem(
      new Request("http://localhost/api/items/item-1/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmName: "Wrong" }),
      }),
      { params: Promise.resolve({ id: "item-1" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "CONFIRMATION_MISMATCH" },
    });
  });

  it("archives an item and writes an audit log", async () => {
    const auditLogCreate = vi.fn();
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce({
        id: "item-1",
        name: "Latte",
        category: "Drinks",
        unit: "cup",
        priceCents: 400,
        currency: "USD",
        currentStock: 0,
        lowStockThreshold: 0,
        isActive: true,
      })
      .mockResolvedValueOnce({
        id: "item-1",
        name: "Latte",
        category: "Drinks",
        unit: "cup",
        priceCents: 400,
        currency: "USD",
        currentStock: 0,
        lowStockThreshold: 0,
        isActive: false,
      });

    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        item: { findUnique, updateMany },
        auditLog: { create: auditLogCreate },
      }),
    );

    const response = await archiveItem(
      new Request("http://localhost/api/items/item-1/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmName: "Latte" }),
      }),
      { params: Promise.resolve({ id: "item-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      item: { id: "item-1", isActive: false },
    });

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "item-1", currentStock: 0, isActive: true }),
      }),
    );
    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "ITEM_ARCHIVED",
          entity: "Item",
          entityId: "item-1",
          actorId: "admin-1",
        }),
      }),
    );
  });

  it("reactivates an item and writes an audit log", async () => {
    const auditLogCreate = vi.fn();
    const update = vi.fn().mockResolvedValue({
      id: "item-1",
      name: "Latte",
      category: "Drinks",
      unit: "cup",
      priceCents: 400,
      currency: "USD",
      currentStock: 0,
      lowStockThreshold: 0,
      isActive: true,
    });

    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        item: {
          findUnique: vi.fn().mockResolvedValue({
            id: "item-1",
            name: "Latte",
            category: "Drinks",
            unit: "cup",
            priceCents: 400,
            currency: "USD",
            currentStock: 0,
            lowStockThreshold: 0,
            isActive: false,
          }),
          update,
        },
        auditLog: { create: auditLogCreate },
      }),
    );

    const response = await reactivateItem(
      new Request("http://localhost/api/items/item-1/reactivate", { method: "POST" }),
      { params: Promise.resolve({ id: "item-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      item: { id: "item-1", isActive: true },
    });
    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "ITEM_REACTIVATED",
          entity: "Item",
          entityId: "item-1",
          actorId: "admin-1",
        }),
      }),
    );
  });
});

describe("items list + restock guards for archived items", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("does not allow members to list archived items via GET /api/items", async () => {
    requireSessionMock.mockResolvedValue({ user: { id: "member-1", role: "MEMBER" } } as never);
    prismaMock.item.findMany.mockResolvedValue([
      {
        id: "item-1",
        name: "Latte",
        category: null,
        unit: null,
        priceCents: 400,
        currency: "USD",
        currentStock: 0,
        lowStockThreshold: 0,
        isActive: true,
      },
    ] as never);

    const response = await listItems(
      new Request("http://localhost/api/items?active=false", { method: "GET" }),
    );

    expect(response.status).toBe(200);
    expect(prismaMock.item.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true },
      }),
    );
  });

  it("blocks restocking an archived item", async () => {
    requireAdminMock.mockResolvedValue({ user: { id: "admin-1" } } as never);
    prismaMock.item.findUnique.mockResolvedValue({
      id: "item-1",
      name: "Latte",
      category: null,
      unit: null,
      priceCents: 400,
      currency: "USD",
      currentStock: 0,
      lowStockThreshold: 0,
      isActive: false,
    } as never);

    const response = await restockItem(
      new Request("http://localhost/api/items/item-1/restock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: 1 }),
      }),
      { params: Promise.resolve({ id: "item-1" }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "ITEM_INACTIVE" },
    });
  });
});
