import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe(".env example defaults", () => {
  it("targets the docker compose db host", () => {
    const envPath = resolve(__dirname, "..", "..", ".env.example");
    const envFile = readFileSync(envPath, "utf-8");

    expect(envFile).toMatch(
      /^DATABASE_URL="postgresql:\/\/postgres:postgres@db:5432\/lab_cafe"$/m
    );
  });
});

