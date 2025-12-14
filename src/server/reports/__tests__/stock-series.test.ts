import { describe, expect, it } from "vitest";

import { buildDailyStockSeries } from "@/server/reports/stock-series";

describe("buildDailyStockSeries", () => {
  it("computes a daily stock series from movements", () => {
    const series = buildDailyStockSeries({
      currentStock: 10,
      startDate: new Date("2025-01-01T00:00:00.000Z"),
      endDate: new Date("2025-01-03T23:59:59.999Z"),
      movements: [
        { type: "RESTOCK", quantity: 5, createdAt: new Date("2025-01-01T12:00:00.000Z") },
        { type: "CONSUME", quantity: 3, createdAt: new Date("2025-01-02T09:00:00.000Z") },
        { type: "WRITE_OFF", quantity: 1, createdAt: new Date("2025-01-02T10:00:00.000Z") },
      ],
    });

    expect(series.labels).toEqual(["2025-01-01", "2025-01-02", "2025-01-03"]);
    expect(series.values).toEqual([14, 10, 10]);
    expect(series.startingStock).toBe(9);
  });

  it("rejects invalid ranges", () => {
    expect(() =>
      buildDailyStockSeries({
        currentStock: 0,
        startDate: new Date("2025-01-02T00:00:00.000Z"),
        endDate: new Date("2025-01-01T00:00:00.000Z"),
        movements: [],
      }),
    ).toThrow("INVALID_RANGE");
  });
});

