import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/server/auth/guards";
import { authErrorToResponse } from "@/server/auth/http";
import { prisma } from "@/server/db/client";

const reactivateItemSchema = z.object({
}).optional();

function getRequestIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  return realIp || null;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAdmin();
    const actor = session.user!;

    const { id } = await context.params;
    const body = await request.json().catch(() => undefined);
    const parsed = reactivateItemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "INVALID_BODY", details: parsed.error.flatten() } },
        { status: 400 },
      );
    }

    const ipAddress = getRequestIp(request);

    const result = await prisma.$transaction(async (tx) => {
      const item = await tx.item.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          category: true,
          unit: true,
          priceCents: true,
          currency: true,
          currentStock: true,
          lowStockThreshold: true,
          isActive: true,
        },
      });

      if (!item) {
        return { status: "NOT_FOUND" as const };
      }

      if (item.isActive) {
        return { status: "ALREADY_ACTIVE" as const, item };
      }

      const updated = await tx.item.update({
        where: { id: item.id },
        data: { isActive: true },
        select: {
          id: true,
          name: true,
          category: true,
          unit: true,
          priceCents: true,
          currency: true,
          currentStock: true,
          lowStockThreshold: true,
          isActive: true,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "ITEM_REACTIVATED",
          entity: "Item",
          entityId: item.id,
          diff: {
            before: { isActive: false },
            after: { isActive: true },
          },
          ipAddress,
        },
      });

      return { status: "OK" as const, item: updated };
    });

    if (result.status === "NOT_FOUND") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Item not found" } },
        { status: 404 },
      );
    }

    return NextResponse.json({ item: result.item });
  } catch (error) {
    const authResponse = authErrorToResponse(error);
    if (authResponse) {
      return authResponse;
    }

    console.error(error);
    return NextResponse.json(
      { error: { code: "SERVER_ERROR", message: "Unable to reactivate item." } },
      { status: 500 },
    );
  }
}
