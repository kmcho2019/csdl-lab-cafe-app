import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("Prisma binary targets", () => {
  const schemaPath = resolve(__dirname, "schema.prisma");
  const schema = readFileSync(schemaPath, "utf-8");

  it("keeps linux-musl OpenSSL 3 support for Alpine builds", () => {
    expect(schema).toMatch(/binaryTargets\s*=\s*\[[^\]]*linux-musl-openssl-3\.0\.x[^\]]*\]/);
  });

  it("adds Debian OpenSSL 3 support for Debian-based containers", () => {
    expect(schema).toMatch(/binaryTargets\s*=\s*\[[^\]]*debian-openssl-3\.0\.x[^\]]*\]/);
  });
});

