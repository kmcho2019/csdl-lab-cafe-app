import { describe, expect, it } from "vitest";

import { toCsv } from "@/lib/csv";

describe("toCsv", () => {
  it("includes a UTF-8 BOM for Excel compatibility", () => {
    const csv = toCsv([["a"]]);
    expect(csv.startsWith("\ufeff")).toBe(true);
  });

  it("escapes commas, quotes, and newlines", () => {
    const csv = toCsv([
      ["name", "note"],
      ['Alex, "Casey"', "Line 1\nLine 2"],
    ]);

    expect(csv).toContain('"Alex, ""Casey"""');
    expect(csv).toContain('"Line 1\nLine 2"');
  });
});

