import { NextResponse } from "next/server";

type AuthError = Error & { status?: number };

export function authErrorToResponse(error: unknown) {
  if (!error || typeof error !== "object") {
    return null;
  }

  const maybeAuthError = error as AuthError;
  if (maybeAuthError.name !== "AuthError" || typeof maybeAuthError.status !== "number") {
    return null;
  }

  return NextResponse.json(
    { error: { code: maybeAuthError.message } },
    { status: maybeAuthError.status },
  );
}

