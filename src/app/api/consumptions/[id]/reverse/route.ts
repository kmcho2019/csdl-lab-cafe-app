import { Role, StockMovementType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/server/auth/guards";
import { authErrorToResponse } from "@/server/auth/http";
import { prisma } from "@/server/db/client";

const reverseConsumptionSchema = z.object({
  note: z
    .string()
    .max(200)
    .refine((value) => /^[\x20-\x7E]*$/.test(value), {
      message: "Note must be ASCII.",
    })
    .optional(),
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
    const session = await requireSession();
    const actor = session.user!;

    const { id } = await context.params;
    const body = await request.json().catch(() => undefined);
    const parsed = reverseConsumptionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "INVALID_BODY", details: parsed.error.flatten() } },
        { status: 400 },
      );
    }

    const note = parsed.data?.note?.trim() || undefined;
    const ipAddress = getRequestIp(request);

    const consumption = await prisma.consumption.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        itemId: true,
        quantity: true,
        settlementId: true,
        reversedAt: true,
      },
    });

    if (!consumption) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Consumption not found." } },
        { status: 404 },
      );
    }

    const isAdmin = actor.role === Role.ADMIN;
    if (!isAdmin && consumption.userId !== actor.id) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "You can only reverse your own transactions." } },
        { status: 403 },
      );
    }

    if (consumption.reversedAt) {
      return NextResponse.json(
        { error: { code: "ALREADY_REVERSED", message: "This transaction has already been reversed." } },
        { status: 409 },
      );
    }

    if (consumption.settlementId) {
      return NextResponse.json(
        { error: { code: "SETTLED", message: "This transaction is part of a finalized settlement and cannot be reversed." } },
        { status: 409 },
      );
    }

    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const updatedCount = await tx.consumption.updateMany({
        where: {
          id: consumption.id,
          reversedAt: null,
          settlementId: null,
          ...(isAdmin ? {} : { userId: actor.id }),
        },
        data: {
          reversedAt: now,
        },
      });

      if (updatedCount.count === 0) {
        throw new Error("NOT_REVERSIBLE");
      }

      const updatedItem = await tx.item.update({
        where: { id: consumption.itemId },
        data: {
          currentStock: { increment: consumption.quantity },
        },
        select: {
          id: true,
          currentStock: true,
        },
      });

      await tx.stockMovement.create({
        data: {
          itemId: consumption.itemId,
          type: StockMovementType.ADJUST,
          quantity: consumption.quantity,
          byUserId: actor.id,
          note: note ? `Reversed consumption ${consumption.id}: ${note}` : `Reversed consumption ${consumption.id}`,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "CONSUMPTION_REVERSED",
          entity: "Consumption",
          entityId: consumption.id,
          diff: {
            note,
            quantity: consumption.quantity,
            itemId: consumption.itemId,
            originalUserId: consumption.userId,
            reversedAt: now.toISOString(),
          },
          ipAddress,
        },
      });

      return {
        consumption: {
          id: consumption.id,
          reversedAt: now.toISOString(),
        },
        item: {
          id: updatedItem.id,
          currentStock: updatedItem.currentStock,
        },
      };
    });

    return NextResponse.json({
      consumption: result.consumption,
      item: result.item,
    });
  } catch (error) {
    const authResponse = authErrorToResponse(error);
    if (authResponse) {
      return authResponse;
    }

    if (error instanceof Error && error.message === "NOT_REVERSIBLE") {
      return NextResponse.json(
        { error: { code: "NOT_REVERSIBLE", message: "This transaction can no longer be reversed." } },
        { status: 409 },
      );
    }

    console.error(error);
    return NextResponse.json(
      { error: { code: "SERVER_ERROR", message: "Unable to reverse transaction." } },
      { status: 500 },
    );
  }
}

