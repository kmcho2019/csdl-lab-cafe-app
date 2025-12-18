import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/guards", () => ({
  requireAdmin: vi.fn(),
}));

vi.mock("@/server/db/client", () => ({
  prisma: {
    ledgerEntry: {
      aggregate: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { GET as getLedgerSummary } from "@/app/api/ledger/summary/route";
import { requireAdmin } from "@/server/auth/guards";
import { prisma } from "@/server/db/client";

const requireAdminMock = vi.mocked(requireAdmin);
const prismaMock = vi.mocked(prisma, { deep: true });

describe("GET /api/ledger/summary", () => {
  it("returns a running balance series for the requested window", async () => {
    requireAdminMock.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN", isActive: true } } as never);

    prismaMock.ledgerEntry.aggregate
      .mockResolvedValueOnce({ _sum: { amountCents: 1000 } } as never)
      .mockResolvedValueOnce({ _sum: { amountCents: 250 } } as never);

    prismaMock.ledgerEntry.findMany.mockResolvedValue([
      { amountCents: 50, timestamp: new Date() },
      { amountCents: -25, timestamp: new Date() },
    ] as never);

    const response = await getLedgerSummary(
      new Request("http://localhost/api/ledger/summary?window=7d", { method: "GET" }),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.window).toBe("7d");
    expect(json.currentBalanceCents).toBe(1000);
    expect(json.startingBalanceCents).toBe(250);
    expect(json.series.labels).toHaveLength(7);
    expect(json.series.values).toHaveLength(7);
  });
});

