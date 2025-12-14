import { describe, expect, it } from "vitest";

import { buildSettlementAccountingCsv } from "@/server/settlements/export";

describe("buildSettlementAccountingCsv", () => {
  it("builds a per-member accounting CSV with memo and breakdown", () => {
    const csv = buildSettlementAccountingCsv({
      settlementNumber: 12,
      startDate: new Date("2025-01-01T00:00:00.000Z"),
      endDate: new Date("2025-01-31T23:59:59.999Z"),
      currency: "KRW",
      generatedAt: new Date("2025-02-01T12:34:56.000Z"),
      lines: [
        {
          userId: "user-1",
          userName: "Alex",
          userEmail: "alex@example.com",
          itemCount: 3,
          totalCents: 1050,
          breakdown: [
            { itemId: "item-1", itemName: "Cold Brew", quantity: 3, unitPriceCents: 350, totalCents: 1050 },
          ],
        },
      ],
    });

    const normalized = csv.replace(/^\ufeff/, "");
    expect(normalized).toContain("settlementNumber,startDate,endDate,generatedAt,userName,userEmail,itemCount,totalCents,currency,totalFormatted,memo,breakdown");
    expect(normalized).toContain("Cafe 2025-01");
    expect(normalized).toContain("Cold Brew x3");
    expect(normalized).toContain("alex@example.com");
  });
});

