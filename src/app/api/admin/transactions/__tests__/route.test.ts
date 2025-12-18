import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/guards", () => ({
  requireAdmin: vi.fn(),
}));

vi.mock("@/server/db/client", () => ({
  prisma: {
    consumption: {
      findMany: vi.fn(),
    },
  },
}));

import { GET as listTransactions } from "@/app/api/admin/transactions/route";
import { requireAdmin } from "@/server/auth/guards";
import { prisma } from "@/server/db/client";

const requireAdminMock = vi.mocked(requireAdmin);
const prismaMock = vi.mocked(prisma, { deep: true });

describe("GET /api/admin/transactions", () => {
  it("rejects invalid query parameters", async () => {
    requireAdminMock.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN", isActive: true } } as never);

    const response = await listTransactions(
      new Request("http://localhost/api/admin/transactions?from=not-a-date", { method: "GET" }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_QUERY" },
    });
  });

  it("returns paginated transactions with stock + owed deltas", async () => {
    requireAdminMock.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN", isActive: true } } as never);

    prismaMock.consumption.findMany.mockResolvedValue([
      {
        id: "c1",
        createdAt: new Date("2025-01-02T12:00:00.000Z"),
        reversedAt: null,
        settlementId: null,
        user: { id: "u1", name: "Alex", email: "alex@example.com" },
        item: { id: "item-1", name: "Cold Brew" },
        quantity: 2,
        priceAtTxCents: 350,
        currency: "USD",
      },
    ] as never);

    const response = await listTransactions(
      new Request("http://localhost/api/admin/transactions?limit=10&includeReversed=true", { method: "GET" }),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.transactions).toHaveLength(1);

    expect(json.transactions[0]).toMatchObject({
      id: "c1",
      quantity: 2,
      chargedCents: 700,
      stockDeltaUnits: -2,
      owedDeltaCents: 700,
      reversal: null,
    });

    expect("stockDeltaCents" in json.transactions[0]).toBe(false);
  });
});

