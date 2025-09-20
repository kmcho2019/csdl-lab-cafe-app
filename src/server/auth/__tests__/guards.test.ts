import { describe, expect, it, vi } from "vitest";

import { createAuthError } from "@/server/auth/guards";

vi.mock("@prisma/client", () => ({
  Role: { ADMIN: "ADMIN" },
  PrismaClient: class PrismaClientMock {},
}));

describe("createAuthError", () => {
  it("creates errors with consistent status codes", () => {
    const unauthenticated = createAuthError("UNAUTHENTICATED");
    expect(unauthenticated.name).toBe("AuthError");
    expect(unauthenticated.status).toBe(401);

    const inactive = createAuthError("USER_INACTIVE");
    expect(inactive.status).toBe(423);

    const forbidden = createAuthError("FORBIDDEN");
    expect(forbidden.status).toBe(403);
  });
});
