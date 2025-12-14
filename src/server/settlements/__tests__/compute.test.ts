import { describe, expect, it } from "vitest";

import { computeSettlementPreviewLines } from "@/server/settlements/compute";

describe("computeSettlementPreviewLines", () => {
  it("groups consumptions per user and item/price", () => {
    const lines = computeSettlementPreviewLines([
      {
        userId: "user-1",
        user: { name: "Alex", email: "alex@example.com" },
        itemId: "item-1",
        item: { name: "Cold Brew" },
        quantity: 1,
        priceAtTxCents: 350,
      },
      {
        userId: "user-1",
        user: { name: "Alex", email: "alex@example.com" },
        itemId: "item-1",
        item: { name: "Cold Brew" },
        quantity: 2,
        priceAtTxCents: 350,
      },
      {
        userId: "user-1",
        user: { name: "Alex", email: "alex@example.com" },
        itemId: "item-1",
        item: { name: "Cold Brew" },
        quantity: 1,
        priceAtTxCents: 300,
      },
      {
        userId: "user-2",
        user: { name: "Casey", email: "casey@example.com" },
        itemId: "item-2",
        item: { name: "Energy Bar" },
        quantity: 1,
        priceAtTxCents: 250,
      },
    ]);

    expect(lines).toHaveLength(2);
    expect(lines[0]?.userEmail).toBe("alex@example.com");

    const alex = lines.find((line) => line.userId === "user-1");
    expect(alex?.itemCount).toBe(4);
    expect(alex?.totalCents).toBe(350 * 3 + 300 * 1);

    expect(alex?.breakdown).toHaveLength(2);
    expect(alex?.breakdown[0]).toMatchObject({
      itemName: "Cold Brew",
      quantity: 3,
      unitPriceCents: 350,
      totalCents: 1050,
    });
  });
});

