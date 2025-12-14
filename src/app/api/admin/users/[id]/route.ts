import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { serializeUser } from "../utils";
import { requireAdmin } from "@/server/auth/guards";
import { authErrorToResponse } from "@/server/auth/http";
import { prisma } from "@/server/db/client";
import { updateUserSchema } from "../schema";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();

    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    const parsed = updateUserSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "INVALID_BODY", details: parsed.error.flatten() } },
        { status: 400 },
      );
    }

    const payload = parsed.data;
    const updates: Prisma.UserUpdateInput = {};

    if (payload.name !== undefined) {
      updates.name = payload.name;
    }

    if (payload.email !== undefined) {
      updates.email = payload.email.toLowerCase();
    }

    if (payload.githubId !== undefined) {
      updates.githubId = payload.githubId || null;
    }

    if (payload.role !== undefined) {
      updates.role = payload.role;
    }

    if (payload.isActive !== undefined) {
      updates.isActive = payload.isActive;
    }

    const user = await prisma.user.update({
      where: { id },
      data: updates,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        githubId: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    if (payload.email) {
      const normalizedEmail = payload.email.toLowerCase();
      const existingAllowlist = await prisma.allowlistEntry.findFirst({
        where: { value: normalizedEmail },
      });

      if (!existingAllowlist) {
        await prisma.allowlistEntry.create({
          data: { value: normalizedEmail, note: "Updated via admin UI" },
        });
      }
    }

    return NextResponse.json({ user: serializeUser(user) });
  } catch (error) {
    const authResponse = authErrorToResponse(error);
    if (authResponse) {
      return authResponse;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return NextResponse.json(
          { error: { code: "CONFLICT", message: "Email or GitHub ID already exists." } },
          { status: 409 },
        );
      }

      if (error.code === "P2025") {
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "User not found." } },
          { status: 404 },
        );
      }
    }

    console.error(error);
    return NextResponse.json(
      { error: { code: "SERVER_ERROR", message: "Unable to update user." } },
      { status: 500 },
    );
  }
}
