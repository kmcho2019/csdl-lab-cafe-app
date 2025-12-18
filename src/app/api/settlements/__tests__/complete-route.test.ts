import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/guards", () => ({
  requireAdmin: vi.fn(),
}));

vi.mock("@/server/db/client", () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

import { POST as completeSettlement } from "@/app/api/settlements/[id]/complete/route";
import { requireAdmin } from "@/server/auth/guards";
import { prisma } from "@/server/db/client";

const requireAdminMock = vi.mocked(requireAdmin);
const prismaMock = vi.mocked(prisma, { deep: true });

describe("POST /api/settlements/:id/complete", () => {
  it("rejects non-billed settlements", async () => {
    requireAdminMock.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN", isActive: true } } as never);

    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        settlement: {
          findUnique: vi.fn().mockResolvedValue({
            id: "settle-1",
            number: 1,
            status: "DRAFT",
            lines: [],
          }),
        },
      }),
    );

    const response = await completeSettlement(
      new Request("http://localhost/api/settlements/settle-1/complete", { method: "POST" }),
      { params: Promise.resolve({ id: "settle-1" }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_STATUS" },
    });
  });

  it("rejects completion when members are unpaid", async () => {
    requireAdminMock.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN", isActive: true } } as never);

    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        settlement: {
          findUnique: vi.fn().mockResolvedValue({
            id: "settle-1",
            number: 1,
            status: "BILLED",
            lines: [
              {
                userId: "u1",
                totalCents: 500,
                user: { id: "u1", name: "Alex", email: "alex@example.com" },
              },
            ],
          }),
          update: vi.fn(),
        },
        payment: {
          groupBy: vi.fn().mockResolvedValue([]),
        },
        ledgerEntry: {
          create: vi.fn(),
        },
        auditLog: {
          create: vi.fn(),
        },
      }),
    );

    const response = await completeSettlement(
      new Request("http://localhost/api/settlements/settle-1/complete", { method: "POST" }),
      { params: Promise.resolve({ id: "settle-1" }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UNPAID" },
    });
  });

  it("finalizes a billed settlement, credits the ledger, and logs the action", async () => {
    requireAdminMock.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN", isActive: true } } as never);

    const ledgerCreate = vi.fn();
    const auditCreate = vi.fn();
    const settlementUpdate = vi.fn().mockResolvedValue({
      id: "settle-1",
      number: 7,
      startDate: new Date("2025-01-01T00:00:00.000Z"),
      endDate: new Date("2025-01-31T23:59:59.999Z"),
      status: "FINALIZED",
      notes: null,
      createdAt: new Date("2025-02-01T00:00:00.000Z"),
      finalizedAt: new Date("2025-02-02T00:00:00.000Z"),
      _count: { consumptions: 3, lines: 2, payments: 2 },
    });

    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        settlement: {
          findUnique: vi.fn().mockResolvedValue({
            id: "settle-1",
            number: 7,
            status: "BILLED",
            lines: [
              { userId: "u1", totalCents: 500, user: { id: "u1", name: "Alex", email: "alex@example.com" } },
              { userId: "u2", totalCents: 300, user: { id: "u2", name: "Sam", email: "sam@example.com" } },
            ],
          }),
          update: settlementUpdate,
        },
        payment: {
          groupBy: vi.fn().mockResolvedValue([
            { userId: "u1", _sum: { amountCents: 500 } },
            { userId: "u2", _sum: { amountCents: 300 } },
          ]),
        },
        ledgerEntry: {
          create: ledgerCreate,
        },
        auditLog: {
          create: auditCreate,
        },
      }),
    );

    const response = await completeSettlement(
      new Request("http://localhost/api/settlements/settle-1/complete", { method: "POST" }),
      { params: Promise.resolve({ id: "settle-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      settlement: {
        id: "settle-1",
        number: 7,
        status: "FINALIZED",
        counts: { lines: 2 },
      },
    });

    expect(ledgerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          category: "SETTLEMENT",
          amountCents: 800,
          settlementId: "settle-1",
          userId: "admin-1",
        }),
      }),
    );

    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "SETTLEMENT_FINALIZED",
          entity: "Settlement",
          entityId: "settle-1",
          actorId: "admin-1",
        }),
      }),
    );
  });
});

