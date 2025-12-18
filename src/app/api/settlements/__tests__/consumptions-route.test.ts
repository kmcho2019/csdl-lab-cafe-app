import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/guards", () => ({
  requireAdmin: vi.fn(),
}));

vi.mock("@/server/db/client", () => ({
  prisma: {
    settlement: {
      findUnique: vi.fn(),
    },
    consumption: {
      findMany: vi.fn(),
    },
  },
}));

import { GET as listSettlementConsumptions } from "@/app/api/settlements/[id]/consumptions/route";
import { requireAdmin } from "@/server/auth/guards";
import { prisma } from "@/server/db/client";

const requireAdminMock = vi.mocked(requireAdmin);
const prismaMock = vi.mocked(prisma, { deep: true });

describe("GET /api/settlements/:id/consumptions", () => {
  it("returns 404 when the settlement does not exist", async () => {
    requireAdminMock.mockResolvedValue({ user: { id: "admin-1" } } as never);
    prismaMock.settlement.findUnique.mockResolvedValue(null as never);

    const response = await listSettlementConsumptions(
      new Request("http://localhost/api/settlements/settle-1/consumptions?limit=50", { method: "GET" }),
      { params: Promise.resolve({ id: "settle-1" }) },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "NOT_FOUND" },
    });
  });

  it("lists unsettled consumptions in the settlement window", async () => {
    requireAdminMock.mockResolvedValue({ user: { id: "admin-1" } } as never);
    prismaMock.settlement.findUnique.mockResolvedValue({
      id: "settle-1",
      startDate: new Date("2025-01-01T00:00:00.000Z"),
      endDate: new Date("2025-01-31T23:59:59.999Z"),
      status: "DRAFT",
    } as never);
    prismaMock.consumption.findMany.mockResolvedValue([
      {
        id: "c1",
        createdAt: new Date("2025-01-02T12:00:00.000Z"),
        user: { id: "u1", name: "Alex", email: "alex@example.com" },
        item: { id: "item-1", name: "Cold Brew" },
        quantity: 1,
        priceAtTxCents: 350,
        currency: "USD",
        settlementId: null,
        reversedAt: null,
      },
    ] as never);

    const response = await listSettlementConsumptions(
      new Request("http://localhost/api/settlements/settle-1/consumptions?limit=10&includeReversed=true", { method: "GET" }),
      { params: Promise.resolve({ id: "settle-1" }) },
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({
      settlement: { id: "settle-1", status: "DRAFT" },
      consumptions: [
        expect.objectContaining({
          id: "c1",
          quantity: 1,
          priceAtTxCents: 350,
          currency: "USD",
          settlementId: null,
          reversedAt: null,
        }),
      ],
    });
  });
});

