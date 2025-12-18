import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/server/auth/guards";
import { authErrorToResponse } from "@/server/auth/http";
import { prisma } from "@/server/db/client";

const archiveItemSchema = z.object({
  confirmName: z.string().min(1),
});

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
    const parsed = archiveItemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "INVALID_BODY", details: parsed.error.flatten() } },
        { status: 400 },
      );
    }

    const ipAddress = getRequestIp(request);
    const confirmName = parsed.data.confirmName.trim();

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

      if (confirmName !== item.name.trim()) {
        return { status: "CONFIRMATION_MISMATCH" as const, expectedName: item.name };
      }

      if (!item.isActive) {
        return { status: "ALREADY_ARCHIVED" as const, item };
      }

      if (item.currentStock !== 0) {
        return { status: "STOCK_NOT_ZERO" as const, currentStock: item.currentStock };
      }

      const updatedCount = await tx.item.updateMany({
        where: { id: item.id, isActive: true, currentStock: 0 },
        data: { isActive: false },
      });

      if (updatedCount.count === 0) {
        return { status: "STOCK_NOT_ZERO" as const, currentStock: item.currentStock };
      }

      const updated = await tx.item.findUnique({
        where: { id: item.id },
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

      if (!updated) {
        return { status: "NOT_FOUND" as const };
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "ITEM_ARCHIVED",
          entity: "Item",
          entityId: item.id,
          diff: {
            before: { isActive: true, currentStock: item.currentStock },
            after: { isActive: false, currentStock: updated.currentStock },
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

    if (result.status === "CONFIRMATION_MISMATCH") {
      return NextResponse.json(
        {
          error: {
            code: "CONFIRMATION_MISMATCH",
            message: `Type the item name exactly to archive it: ${result.expectedName}`,
          },
        },
        { status: 400 },
      );
    }

    if (result.status === "STOCK_NOT_ZERO") {
      return NextResponse.json(
        {
          error: {
            code: "STOCK_NOT_ZERO",
            message: "Item must have 0 stock before it can be archived. Write off remaining stock first.",
          },
        },
        { status: 409 },
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
      { error: { code: "SERVER_ERROR", message: "Unable to archive item." } },
      { status: 500 },
    );
  }
}

