import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("Prisma schema configuration", () => {
  it("includes linux-musl OpenSSL 3 binary target to support Alpine runtimes", () => {
    const schemaPath = resolve(__dirname, "schema.prisma");
    const schema = readFileSync(schemaPath, "utf-8");

    expect(schema).toMatch(/binaryTargets\s*=\s*\[[^\]]*linux-musl-openssl-3\.0\.x[^\]]*\]/);
  });
});
