import { describe, expect, it } from "vitest";

import { env } from "@/lib/env";
import { authOptions } from "@/server/auth/options";

describe("authOptions", () => {
  it("shares the env-provided NextAuth secret", () => {
    expect(authOptions.secret).toBe(env.NEXTAUTH_SECRET);
    expect(authOptions.secret).toBeDefined();
  });
});

