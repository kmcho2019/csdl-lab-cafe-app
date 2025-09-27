import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe(".env example defaults", () => {
  it("targets the docker compose db host", () => {
    const envPath = resolve(__dirname, "..", "..", ".env.example");
    const envFile = readFileSync(envPath, "utf-8");

    expect(envFile).toMatch(/^POSTGRES_USER="postgres"$/m);
    expect(envFile).toMatch(/^POSTGRES_PASSWORD="postgres"$/m);
    expect(envFile).toMatch(/^POSTGRES_DB="lab_cafe"$/m);
    expect(envFile).toMatch(/^POSTGRES_HOST="db"$/m);
    expect(envFile).toMatch(/^POSTGRES_PORT="5432"$/m);
    expect(envFile).toMatch(
      /^DATABASE_URL="postgresql:\/\/\$\{POSTGRES_USER\}:\$\{POSTGRES_PASSWORD\}@\$\{POSTGRES_HOST\}:\$\{POSTGRES_PORT\}\/\$\{POSTGRES_DB\}"$/m
    );
  });
});
