import { describe, expect, it } from "vitest";

import { createSettlementSchema } from "@/app/api/settlements/schema";

describe("createSettlementSchema", () => {
  it("accepts a YYYY-MM month payload", () => {
    const parsed = createSettlementSchema.safeParse({ month: "2025-10" });
    expect(parsed.success).toBe(true);
  });

  it("rejects invalid month formats", () => {
    expect(createSettlementSchema.safeParse({ month: "2025-1" }).success).toBe(false);
    expect(createSettlementSchema.safeParse({ month: "2025-13" }).success).toBe(false);
  });
});

