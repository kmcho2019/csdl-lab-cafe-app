import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/guards", () => ({
  requireAdmin: vi.fn(),
}));

vi.mock("@/server/db/client", () => ({
  prisma: {
    ledgerEntry: {
      findMany: vi.fn(),
      aggregate: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { GET as listLedger, POST as createLedgerEntry } from "@/app/api/ledger/route";
import { requireAdmin } from "@/server/auth/guards";
import { prisma } from "@/server/db/client";

const requireAdminMock = vi.mocked(requireAdmin);
const prismaMock = vi.mocked(prisma, { deep: true });

describe("POST /api/ledger", () => {
  it("rejects non-ASCII descriptions", async () => {
    requireAdminMock.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN", isActive: true } } as never);

    const response = await createLedgerEntry(
      new Request("http://localhost/api/ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "안녕", amountCents: 100, category: "ADJUSTMENT" }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_BODY" },
    });
  });

  it("rejects zero-amount entries", async () => {
    requireAdminMock.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN", isActive: true } } as never);

    const response = await createLedgerEntry(
      new Request("http://localhost/api/ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "Opening float", amountCents: 0, category: "RECEIPT" }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_BODY" },
    });
  });

  it("creates an entry and logs it", async () => {
    requireAdminMock.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN", isActive: true } } as never);

    const ledgerCreate = vi.fn().mockResolvedValue({
      id: "le-1",
      timestamp: new Date("2025-01-01T00:00:00.000Z"),
      description: "Donation",
      amountCents: 5000,
      category: "RECEIPT",
      balanceAfterCents: null,
    });
    const auditCreate = vi.fn();

    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        ledgerEntry: { create: ledgerCreate },
        auditLog: { create: auditCreate },
      }),
    );

    const response = await createLedgerEntry(
      new Request("http://localhost/api/ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "Donation", amountCents: 5000, category: "RECEIPT" }),
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      entry: { id: "le-1", amountCents: 5000, category: "RECEIPT" },
    });

    expect(ledgerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "admin-1" }),
      }),
    );
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "LEDGER_ENTRY_CREATED",
          entity: "LedgerEntry",
          entityId: "le-1",
          actorId: "admin-1",
        }),
      }),
    );
  });
});

describe("GET /api/ledger", () => {
  it("returns current balance and entries", async () => {
    requireAdminMock.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN", isActive: true } } as never);

    prismaMock.ledgerEntry.findMany.mockResolvedValue([] as never);
    prismaMock.ledgerEntry.aggregate.mockResolvedValue({ _sum: { amountCents: 12345 } } as never);

    const response = await listLedger(new Request("http://localhost/api/ledger?limit=50", { method: "GET" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      currentBalanceCents: 12345,
      entries: [],
    });
  });
});

