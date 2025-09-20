import { describe, expect, it } from "vitest";

import { formatCurrency, getCurrencyMetadata, toMajorUnits } from "@/lib/currency";

describe("currency helpers", () => {
  it("normalizes currency metadata", () => {
    expect(getCurrencyMetadata("krw")).toEqual({ currency: "KRW", decimals: 0, locale: "ko-KR" });
    expect(getCurrencyMetadata("USD")).toEqual({ currency: "USD", decimals: 2, locale: "en-US" });
  });

  it("formats zero-decimal currencies without cents", () => {
    expect(formatCurrency(1500, "KRW", { locale: "ko-KR" })).toBe("₩1,500");
  });

  it("formats minor units with decimals for USD", () => {
    expect(formatCurrency(12345, "USD", { locale: "en-US" })).toBe("$123.45");
  });

  it("calculates major units respecting decimals", () => {
    expect(toMajorUnits(100, "USD")).toBe(1);
    expect(toMajorUnits(100, "KRW")).toBe(100);
  });
});
