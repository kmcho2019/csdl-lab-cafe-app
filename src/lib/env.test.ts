import { describe, expect, it } from "vitest";

import { DEV_SECRET_FALLBACK, env } from "./env";

describe("env", () => {
  it("uses a development secret that satisfies Auth.js requirements", () => {
    expect(DEV_SECRET_FALLBACK.length).toBeGreaterThanOrEqual(32);
    expect(env.NEXTAUTH_SECRET?.length ?? 0).toBeGreaterThanOrEqual(32);
  });
});
