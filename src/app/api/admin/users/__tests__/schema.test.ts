import { describe, expect, it } from "vitest";

import { createUserSchema } from "@/app/api/admin/users/route";
import { updateUserSchema } from "@/app/api/admin/users/[id]/route";

describe("admin user schemas", () => {
  it("accepts valid user creation payloads", () => {
    const result = createUserSchema.safeParse({
      name: "Alex",
      email: "alex@example.com",
      githubId: "12345",
      role: "ADMIN",
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid emails for creation", () => {
    const result = createUserSchema.safeParse({
      name: "Alex",
      email: "not-an-email",
    });

    expect(result.success).toBe(false);
  });

  it("requires at least one field for updates", () => {
    const result = updateUserSchema.safeParse({});

    expect(result.success).toBe(false);
  });

  it("allows toggling isActive and role together", () => {
    const result = updateUserSchema.safeParse({
      isActive: false,
      role: "MEMBER",
    });

    expect(result.success).toBe(true);
  });
});
