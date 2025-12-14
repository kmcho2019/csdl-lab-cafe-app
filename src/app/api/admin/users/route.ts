import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/server/auth/guards";
import { authErrorToResponse } from "@/server/auth/http";
import { prisma } from "@/server/db/client";

import { serializeUser } from "./utils";
import { createUserSchema } from "./schema";

export async function GET() {
  try {
    await requireAdmin();

    const users = await prisma.user.findMany({
      orderBy: [{ role: "desc" }, { createdAt: "asc" }],
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

    return NextResponse.json({ users: users.map(serializeUser) });
  } catch (error) {
    const authResponse = authErrorToResponse(error);
    if (authResponse) {
      return authResponse;
    }

    console.error(error);
    return NextResponse.json(
      { error: { code: "SERVER_ERROR", message: "Unable to load users." } },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();

    const body = await request.json().catch(() => null);
    const parsed = createUserSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "INVALID_BODY", details: parsed.error.flatten() } },
        { status: 400 },
      );
    }

    const { name, email, githubId, role } = parsed.data;
    const normalizedEmail = email.toLowerCase();

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name,
          email: normalizedEmail,
          githubId: githubId ?? undefined,
          role,
        },
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

      const existingAllowlist = await tx.allowlistEntry.findFirst({
        where: { value: normalizedEmail },
      });

      if (!existingAllowlist) {
        await tx.allowlistEntry.create({
          data: { value: normalizedEmail, note: "Added via admin UI" },
        });
      }

      return created;
    });

    return NextResponse.json({ user: serializeUser(user) }, { status: 201 });
  } catch (error) {
    const authResponse = authErrorToResponse(error);
    if (authResponse) {
      return authResponse;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: { code: "CONFLICT", message: "Email or GitHub ID already exists." } },
        { status: 409 },
      );
    }

    console.error(error);
    return NextResponse.json(
      { error: { code: "SERVER_ERROR", message: "Unable to create user." } },
      { status: 500 },
    );
  }
}
