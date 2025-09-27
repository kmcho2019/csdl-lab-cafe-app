import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("docker compose database wiring", () => {
  it("projects POSTGRES_* values into the web container DATABASE_URL", () => {
    const composePath = resolve(__dirname, "..", "..", "docker-compose.yml");
    const contents = readFileSync(composePath, "utf-8");

    expect(contents).toMatch(
      /DATABASE_URL: "postgresql:\/\/\$\{POSTGRES_USER:-postgres\}:\$\{POSTGRES_PASSWORD:-postgres\}@\$\{POSTGRES_HOST:-db\}:\$\{POSTGRES_PORT:-5432\}\/\$\{POSTGRES_DB:-lab_cafe\}"/
    );
    expect(contents).toMatch(/POSTGRES_USER: \$\{POSTGRES_USER:-postgres\}/);
    expect(contents).toMatch(/POSTGRES_PASSWORD: \$\{POSTGRES_PASSWORD:-postgres\}/);
    expect(contents).toMatch(/POSTGRES_DB: \$\{POSTGRES_DB:-lab_cafe\}/);
  });
});
