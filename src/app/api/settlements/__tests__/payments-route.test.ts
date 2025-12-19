import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/guards", () => ({
  requireAdmin: vi.fn(),
}));

vi.mock("@/server/db/client", () => ({
  prisma: {
    settlement: {
      findUnique: vi.fn(),
    },
    payment: {
      groupBy: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { GET as getPayments, POST as togglePayment } from "@/app/api/settlements/[id]/payments/route";
import { requireAdmin } from "@/server/auth/guards";
import { prisma } from "@/server/db/client";

const requireAdminMock = vi.mocked(requireAdmin);
const prismaMock = vi.mocked(prisma, { deep: true });

describe("GET /api/settlements/:id/payments", () => {
  it("returns 404 for unknown settlements", async () => {
    requireAdminMock.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN", isActive: true } } as never);
    prismaMock.settlement.findUnique.mockResolvedValue(null as never);

    const response = await getPayments(
      new Request("http://localhost/api/settlements/settle-1/payments", { method: "GET" }),
      { params: Promise.resolve({ id: "settle-1" }) },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "NOT_FOUND" },
    });
  });

  it("summarizes paid status per member", async () => {
    requireAdminMock.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN", isActive: true } } as never);

    prismaMock.settlement.findUnique.mockResolvedValue({
      id: "settle-1",
      number: 7,
      startDate: new Date("2025-01-01T00:00:00.000Z"),
      endDate: new Date("2025-01-31T23:59:59.999Z"),
      status: "BILLED",
      notes: null,
      lines: [
        { userId: "u1", itemCount: 3, totalCents: 500, user: { id: "u1", name: "Alex", email: "alex@example.com" } },
        { userId: "u2", itemCount: 1, totalCents: 300, user: { id: "u2", name: "Sam", email: "sam@example.com" } },
      ],
    } as never);

    prismaMock.payment.groupBy.mockResolvedValue([
      { userId: "u1", _sum: { amountCents: 500 } },
      { userId: "u2", _sum: { amountCents: 100 } },
    ] as never);

    const response = await getPayments(
      new Request("http://localhost/api/settlements/settle-1/payments", { method: "GET" }),
      { params: Promise.resolve({ id: "settle-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      settlement: { id: "settle-1", status: "BILLED" },
      totals: { dueCents: 800, paidCents: 600 },
      lines: [
        expect.objectContaining({ userId: "u1", isPaid: true, totalCents: 500, paidCents: 500 }),
        expect.objectContaining({ userId: "u2", isPaid: false, totalCents: 300, paidCents: 100 }),
      ],
    });
  });
});

describe("POST /api/settlements/:id/payments", () => {
  it("rejects control characters in references", async () => {
    requireAdminMock.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN", isActive: true } } as never);

    const response = await togglePayment(
      new Request("http://localhost/api/settlements/settle-1/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "u1", isPaid: true, reference: "Bad\u0000Ref" }),
      }),
      { params: Promise.resolve({ id: "settle-1" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_BODY" },
    });
  });

  it("rejects toggles for non-billed settlements", async () => {
    requireAdminMock.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN", isActive: true } } as never);

    prismaMock.settlement.findUnique.mockResolvedValue({
      id: "settle-1",
      status: "DRAFT",
      lines: [{ userId: "u1", totalCents: 500 }],
    } as never);

    const response = await togglePayment(
      new Request("http://localhost/api/settlements/settle-1/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "u1", isPaid: true, reference: "\uCE74\uCE74\uC624\uBC45\uD06C \uC1A1\uAE08" }),
      }),
      { params: Promise.resolve({ id: "settle-1" }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_STATUS" },
    });
  });

  it("marks a member paid and returns updated settlement counts", async () => {
    requireAdminMock.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN", isActive: true } } as never);

    prismaMock.settlement.findUnique
      .mockResolvedValueOnce({
        id: "settle-1",
        number: 7,
        startDate: new Date("2025-01-01T00:00:00.000Z"),
        endDate: new Date("2025-01-31T23:59:59.999Z"),
        status: "BILLED",
        notes: null,
        lines: [{ userId: "u1", totalCents: 500 }],
      } as never)
      .mockResolvedValueOnce({
        id: "settle-1",
        number: 7,
        startDate: new Date("2025-01-01T00:00:00.000Z"),
        endDate: new Date("2025-01-31T23:59:59.999Z"),
        status: "BILLED",
        notes: null,
        createdAt: new Date("2025-02-01T00:00:00.000Z"),
        finalizedAt: null,
        _count: { consumptions: 10, lines: 1, payments: 1 },
      } as never);

    const paymentAggregate = vi.fn().mockResolvedValue({ _sum: { amountCents: 0 } });
    const paymentDeleteMany = vi.fn();
    const paymentCreate = vi.fn();
    const auditCreate = vi.fn();

    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        payment: {
          aggregate: paymentAggregate,
          deleteMany: paymentDeleteMany,
          create: paymentCreate,
        },
        auditLog: { create: auditCreate },
      }),
    );

    const response = await togglePayment(
      new Request("http://localhost/api/settlements/settle-1/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "u1", isPaid: true, reference: "\uCE74\uCE74\uC624\uBC45\uD06C \uC1A1\uAE08" }),
      }),
      { params: Promise.resolve({ id: "settle-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      settlement: {
        id: "settle-1",
        status: "BILLED",
        counts: { payments: 1 },
      },
    });

    expect(paymentDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ settlementId: "settle-1", userId: "u1" }) }),
    );
    expect(paymentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "u1",
          settlementId: "settle-1",
          amountCents: 500,
          reference: "\uCE74\uCE74\uC624\uBC45\uD06C \uC1A1\uAE08",
        }),
      }),
    );
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "SETTLEMENT_PAYMENT_MARKED",
          entity: "Settlement",
          entityId: "settle-1",
          actorId: "admin-1",
        }),
      }),
    );
  });
});
