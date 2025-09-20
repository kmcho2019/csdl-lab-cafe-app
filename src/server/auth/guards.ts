import { Role } from "@prisma/client";

import { getAuthSession } from "@/server/auth/session";

export async function requireSession() {
  const session = await getAuthSession();
  if (!session || !session.user) {
    throw createAuthError("UNAUTHENTICATED");
  }

  if (!session.user.isActive) {
    throw createAuthError("USER_INACTIVE");
  }

  return session;
}

export async function requireAdmin() {
  const session = await requireSession();
  if (session.user?.role !== Role.ADMIN) {
    throw createAuthError("FORBIDDEN");
  }

  return session;
}

export function createAuthError(code: "UNAUTHENTICATED" | "FORBIDDEN" | "USER_INACTIVE") {
  const status = code === "FORBIDDEN" ? 403 : code === "USER_INACTIVE" ? 423 : 401;
  const error = new Error(code) as Error & { status: number };
  error.name = "AuthError";
  error.message = code;
  error.status = status;
  return error;
}
