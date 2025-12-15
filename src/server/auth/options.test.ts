import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMocks = vi.hoisted(() => ({
  allowlistEntryFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  accountFindUnique: vi.fn(),
  accountCreate: vi.fn(),
}));

vi.mock("@/server/db/client", () => ({
  prisma: {
    allowlistEntry: { findFirst: prismaMocks.allowlistEntryFindFirst },
    user: { findUnique: prismaMocks.userFindUnique, update: prismaMocks.userUpdate },
    account: { findUnique: prismaMocks.accountFindUnique, create: prismaMocks.accountCreate },
  },
}));

import { env } from "@/lib/env";
import { authOptions } from "@/server/auth/options";

describe("authOptions", () => {
  beforeEach(() => {
    prismaMocks.allowlistEntryFindFirst.mockReset();
    prismaMocks.userFindUnique.mockReset();
    prismaMocks.userUpdate.mockReset();
    prismaMocks.accountFindUnique.mockReset();
    prismaMocks.accountCreate.mockReset();

    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shares the env-provided NextAuth secret", () => {
    expect(authOptions.secret).toBe(env.NEXTAUTH_SECRET);
    expect(authOptions.secret).toBeDefined();
  });

  it("stores the GitHub numeric id on new users", () => {
    const githubProvider = authOptions.providers?.find(
      (provider) => typeof provider === "object" && "id" in provider && provider.id === "github",
    ) as { profile?: (profile: Record<string, unknown>) => Record<string, unknown>; options?: Record<string, unknown> } | undefined;

    const profileFn =
      (githubProvider?.options as { profile?: (profile: Record<string, unknown>) => Record<string, unknown> } | undefined)
        ?.profile ?? githubProvider?.profile;

    expect(profileFn).toBeTypeOf("function");

    const mapped = profileFn?.({
      id: 123,
      login: "alex",
      name: "Alex",
      email: "alex@example.com",
    });

    expect(mapped?.githubId).toBe("123");
  });

  it("auto-links GitHub OAuth accounts to pre-created users by email", async () => {
    prismaMocks.allowlistEntryFindFirst.mockResolvedValue({ id: "allowlist-1" });
    prismaMocks.userFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "user-1",
        email: "alex@example.com",
        isActive: true,
        githubId: null,
      });
    prismaMocks.accountFindUnique.mockResolvedValue(null);

    const allowed = await authOptions.callbacks?.signIn?.({
      user: { email: "alex@example.com" },
      account: {
        provider: "github",
        providerAccountId: "123",
        type: "oauth",
        access_token: "token",
      },
      profile: { email: "alex@example.com", login: "alex" },
    } as never);

    expect(allowed).toBe(true);
    expect(prismaMocks.accountCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          provider: "github",
          providerAccountId: "123",
          type: "oauth",
        }),
      }),
    );
    expect(prismaMocks.userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: { githubId: "123" },
      }),
    );
  });

  it("allows GitHub sign-in when email is unavailable but the user matches by GitHub id", async () => {
    prismaMocks.allowlistEntryFindFirst.mockResolvedValue({ id: "allowlist-1" });
    prismaMocks.userFindUnique.mockResolvedValueOnce({
      id: "user-1",
      email: "alex@example.com",
      isActive: true,
      githubId: "123",
    });
    prismaMocks.accountFindUnique.mockResolvedValue(null);

    const allowed = await authOptions.callbacks?.signIn?.({
      user: {},
      account: {
        provider: "github",
        providerAccountId: "123",
        type: "oauth",
        access_token: "token",
      },
      profile: { login: "alex" },
    } as never);

    expect(allowed).toBe(true);
    expect(prismaMocks.accountCreate).toHaveBeenCalledTimes(1);
  });

  it("blocks sign-in when the resolved email is not allowlisted", async () => {
    prismaMocks.allowlistEntryFindFirst.mockResolvedValue(null);

    const allowed = await authOptions.callbacks?.signIn?.({
      user: { email: "blocked@example.com" },
      account: {
        provider: "github",
        providerAccountId: "987",
        type: "oauth",
      },
      profile: { email: "blocked@example.com", login: "blocked" },
    } as never);

    expect(allowed).toBe(false);
    expect(prismaMocks.accountCreate).not.toHaveBeenCalled();
  });

  it("blocks sign-in for frozen users even if allowlisted", async () => {
    prismaMocks.allowlistEntryFindFirst.mockResolvedValue({ id: "allowlist-1" });
    prismaMocks.userFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "user-1",
        email: "alex@example.com",
        isActive: false,
        githubId: null,
      });

    const allowed = await authOptions.callbacks?.signIn?.({
      user: { email: "alex@example.com" },
      account: {
        provider: "github",
        providerAccountId: "123",
        type: "oauth",
      },
      profile: { email: "alex@example.com", login: "alex" },
    } as never);

    expect(allowed).toBe(false);
    expect(prismaMocks.accountCreate).not.toHaveBeenCalled();
  });
});
