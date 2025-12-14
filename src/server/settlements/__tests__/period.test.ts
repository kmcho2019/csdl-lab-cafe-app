import { describe, expect, it } from "vitest";

import { getMonthRangeUtc } from "@/server/settlements/period";

describe("getMonthRangeUtc", () => {
  it("returns UTC month boundaries", () => {
    const range = getMonthRangeUtc("2025-02");
    expect(range.startDate.toISOString()).toBe("2025-02-01T00:00:00.000Z");
    expect(range.endDate.toISOString()).toBe("2025-02-28T23:59:59.999Z");
  });

  it("handles leap years", () => {
    const range = getMonthRangeUtc("2024-02");
    expect(range.endDate.toISOString()).toBe("2024-02-29T23:59:59.999Z");
  });

  it("rejects invalid input", () => {
    expect(() => getMonthRangeUtc("2025-13")).toThrow("INVALID_MONTH");
    expect(() => getMonthRangeUtc("nope")).toThrow("INVALID_MONTH");
  });
});

