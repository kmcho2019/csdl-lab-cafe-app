import { Prisma, Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { serializeUser } from "../utils";
import { requireAdmin } from "@/server/auth/guards";
import { prisma } from "@/server/db/client";

export const updateUserSchema = z
  .object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    githubId: z.string().trim().min(1).optional().nullable(),
    role: z.nativeEnum(Role).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  await requireAdmin();

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

  try {
    const user = await prisma.user.update({
      where: { id: params.id },
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
