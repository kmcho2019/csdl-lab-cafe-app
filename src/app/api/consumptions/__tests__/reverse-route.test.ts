import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/guards", () => ({
  requireSession: vi.fn(),
}));

vi.mock("@/server/db/client", () => ({
  prisma: {
    consumption: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { POST as reverseConsumption } from "@/app/api/consumptions/[id]/reverse/route";
import { requireSession } from "@/server/auth/guards";
import { prisma } from "@/server/db/client";

const requireSessionMock = vi.mocked(requireSession);
const prismaMock = vi.mocked(prisma, { deep: true });

describe("POST /api/consumptions/:id/reverse", () => {
  it("rejects control characters in notes", async () => {
    requireSessionMock.mockResolvedValue({ user: { id: "user-1", role: "MEMBER", isActive: true } } as never);

    const response = await reverseConsumption(
      new Request("http://localhost/api/consumptions/c1/reverse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "Bad\u0000Note" }),
      }),
      { params: Promise.resolve({ id: "c1" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_BODY" },
    });
  });

  it("prevents members from reversing other users' transactions", async () => {
    requireSessionMock.mockResolvedValue({ user: { id: "user-1", role: "MEMBER", isActive: true } } as never);
    prismaMock.consumption.findUnique.mockResolvedValue({
      id: "c1",
      userId: "user-2",
      itemId: "item-1",
      quantity: 1,
      settlementId: null,
      reversedAt: null,
    } as never);

    const response = await reverseConsumption(
      new Request("http://localhost/api/consumptions/c1/reverse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "c1" }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "FORBIDDEN" },
    });
  });

  it("blocks reversing settled transactions", async () => {
    requireSessionMock.mockResolvedValue({ user: { id: "user-1", role: "ADMIN", isActive: true } } as never);
    prismaMock.consumption.findUnique.mockResolvedValue({
      id: "c1",
      userId: "user-2",
      itemId: "item-1",
      quantity: 1,
      settlementId: "settlement-1",
      reversedAt: null,
    } as never);

    const response = await reverseConsumption(
      new Request("http://localhost/api/consumptions/c1/reverse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "c1" }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "SETTLED" },
    });
  });

  it("blocks reversing already reversed transactions", async () => {
    requireSessionMock.mockResolvedValue({ user: { id: "user-1", role: "ADMIN", isActive: true } } as never);
    prismaMock.consumption.findUnique.mockResolvedValue({
      id: "c1",
      userId: "user-2",
      itemId: "item-1",
      quantity: 1,
      settlementId: null,
      reversedAt: new Date("2025-01-01T00:00:00.000Z"),
    } as never);

    const response = await reverseConsumption(
      new Request("http://localhost/api/consumptions/c1/reverse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "c1" }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "ALREADY_REVERSED" },
    });
  });

  it("reverses an unsettled transaction and logs the action", async () => {
    requireSessionMock.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN", isActive: true } } as never);
    prismaMock.consumption.findUnique.mockResolvedValue({
      id: "c1",
      userId: "user-2",
      itemId: "item-1",
      quantity: 2,
      settlementId: null,
      reversedAt: null,
    } as never);

    const auditLogCreate = vi.fn();
    const stockMoveCreate = vi.fn();
    const consumptionUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const itemUpdate = vi.fn().mockResolvedValue({ id: "item-1", currentStock: 10 });

    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        consumption: { updateMany: consumptionUpdateMany },
        item: { update: itemUpdate },
        stockMovement: { create: stockMoveCreate },
        auditLog: { create: auditLogCreate },
      }),
    );

    const response = await reverseConsumption(
      new Request("http://localhost/api/consumptions/c1/reverse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "\uC2E4\uC218" }),
      }),
      { params: Promise.resolve({ id: "c1" }) },
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({
      consumption: { id: "c1", reversedAt: expect.any(String) },
      item: { id: "item-1", currentStock: 10 },
    });

    expect(consumptionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "c1", settlementId: null, reversedAt: null }),
      }),
    );
    expect(stockMoveCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          itemId: "item-1",
          quantity: 2,
          note: expect.stringContaining("\uC2E4\uC218"),
        }),
      }),
    );
    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "CONSUMPTION_REVERSED",
          entity: "Consumption",
          entityId: "c1",
          actorId: "admin-1",
        }),
      }),
    );
  });
});
