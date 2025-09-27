import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

describe("env", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("uses a development secret that satisfies Auth.js requirements", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.NEXTAUTH_SECRET;

    const { DEV_SECRET_FALLBACK, env } = await import("./env");

    expect(DEV_SECRET_FALLBACK.length).toBeGreaterThanOrEqual(32);
    expect(env.NEXTAUTH_SECRET?.length ?? 0).toBeGreaterThanOrEqual(32);
  });

  it("expands DATABASE_URL placeholders from Postgres configuration", async () => {
    process.env.POSTGRES_USER = "cafe";
    process.env.POSTGRES_PASSWORD = "super-secret";
    process.env.POSTGRES_DB = "lab";
    process.env.POSTGRES_HOST = "db";
    process.env.POSTGRES_PORT = "6500";
    process.env.DATABASE_URL =
      "postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}";

    const { env } = await import("./env");

    expect(env.DATABASE_URL).toBe("postgresql://cafe:super-secret@db:6500/lab");
  });

  it("strips wrapping quotes from Postgres credential fields", async () => {
    process.env.POSTGRES_USER = '"postgres"';
    process.env.POSTGRES_PASSWORD = "'postgres'";
    process.env.POSTGRES_DB = '"lab_cafe"';
    process.env.POSTGRES_HOST = "'db'";
    process.env.POSTGRES_PORT = '"5432"';
    delete process.env.DATABASE_URL;

    const { env } = await import("./env");

    expect(env.POSTGRES_USER).toBe("postgres");
    expect(env.POSTGRES_PASSWORD).toBe("postgres");
    expect(env.POSTGRES_DB).toBe("lab_cafe");
    expect(env.POSTGRES_HOST).toBe("db");
    expect(env.POSTGRES_PORT).toBe("5432");
    expect(env.DATABASE_URL).toBe("postgresql://postgres:postgres@db:5432/lab_cafe");
  });
});
