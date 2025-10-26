import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";

import { DOCS } from "@/app/docs/registry";

describe("documentation registry", () => {
  it("lists unique slugs", () => {
    const slugs = DOCS.map((doc) => doc.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("resolves to real files", () => {
    for (const doc of DOCS) {
      const absolute = path.resolve(process.cwd(), doc.file);
      expect(existsSync(absolute)).toBe(true);
    }
  });
});
