import { describe, expect, it } from "vitest";

import { kioskCheckoutSchema } from "@/app/api/kiosk/checkout/route";

describe("kiosk checkout schema", () => {
  it("accepts a valid payload", () => {
    const result = kioskCheckoutSchema.safeParse({
      userId: "user-1",
      cart: [
        { itemId: "item-1", quantity: 2 },
        { itemId: "item-2", quantity: 1 },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("rejects empty carts", () => {
    const result = kioskCheckoutSchema.safeParse({ userId: "user-1", cart: [] });
    expect(result.success).toBe(false);
  });
});

