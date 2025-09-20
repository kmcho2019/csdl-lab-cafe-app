import { StockMovementType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/server/auth/guards";
import { prisma } from "@/server/db/client";

const consumptionSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.coerce.number().int().positive().default(1),
});

export async function POST(request: Request) {
  const session = await requireSession();
  const user = session.user!;

  const parsed = consumptionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_BODY", details: parsed.error.flatten() } },
      { status: 400 },
    );
  }

  const { itemId, quantity } = parsed.data;

  const item = await prisma.item.findFirst({
    where: { id: itemId, isActive: true },
  });

  if (!item) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Item not found or inactive" } },
      { status: 404 },
    );
  }

  if (quantity <= 0) {
    return NextResponse.json(
      { error: { code: "INVALID_QUANTITY", message: "Quantity must be positive" } },
      { status: 400 },
    );
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const updatedCount = await tx.item.updateMany({
        where: {
          id: item.id,
          currentStock: { gte: quantity },
        },
        data: {
          currentStock: { decrement: quantity },
        },
      });

      if (updatedCount.count === 0) {
        throw new Error("OUT_OF_STOCK");
      }

      const consumption = await tx.consumption.create({
        data: {
          userId: user.id,
          itemId: item.id,
          quantity,
          priceAtTxCents: item.priceCents,
          currency: item.currency,
        },
      });

      const updatedItem = await tx.item.findUnique({
        where: { id: item.id },
        select: { currentStock: true },
      });

      await tx.stockMovement.create({
        data: {
          itemId: item.id,
          type: StockMovementType.CONSUME,
          quantity,
          byUserId: user.id,
        },
      });

      return {
        consumption,
        newStock: updatedItem?.currentStock ?? 0,
      };
    });

    return NextResponse.json({
      consumption: result.consumption,
      newStock: result.newStock,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "OUT_OF_STOCK") {
      return NextResponse.json(
        { error: { code: "OUT_OF_STOCK", message: "Not enough stock to fulfill request" } },
        { status: 409 },
      );
    }

    console.error(error);
    return NextResponse.json(
      { error: { code: "SERVER_ERROR", message: "Could not record consumption" } },
      { status: 500 },
    );
  }
}
