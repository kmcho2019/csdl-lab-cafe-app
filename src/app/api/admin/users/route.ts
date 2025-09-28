import { Prisma, Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/server/auth/guards";
import { prisma } from "@/server/db/client";

import { serializeUser } from "./utils";

export const createUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email required"),
  githubId: z.string().trim().min(1, "GitHub ID must not be empty").optional(),
  role: z.nativeEnum(Role).default(Role.MEMBER),
});

export async function GET() {
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
}

export async function POST(request: Request) {
  const session = await requireAdmin();
  void session;

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

  try {
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
