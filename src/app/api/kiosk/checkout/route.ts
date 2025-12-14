import { Role, StockMovementType } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireSession } from "@/server/auth/guards";
import { authErrorToResponse } from "@/server/auth/http";
import { prisma } from "@/server/db/client";
import { kioskCheckoutSchema } from "./schema";

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const actor = session.user!;

    const payload = await request.json().catch(() => null);
    const parsed = kioskCheckoutSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "INVALID_BODY", details: parsed.error.flatten() } },
        { status: 400 },
      );
    }

    const { userId, cart } = parsed.data;

    if (actor.role !== Role.ADMIN && userId !== actor.id) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Members can only record purchases for themselves." } },
        { status: 403 },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const targetUser = await tx.user.findUnique({
        where: { id: userId, isActive: true },
        select: { id: true },
      });
      if (!targetUser) {
        throw new Error("USER_NOT_FOUND");
      }

      const itemIds = cart.map((line) => line.itemId);
      const itemRecords = await tx.item.findMany({
        where: { id: { in: itemIds }, isActive: true },
      });

      if (itemRecords.length !== itemIds.length) {
        throw new Error("ITEM_NOT_FOUND");
      }

      const totals = {
        totalCents: 0,
        currency: itemRecords[0]?.currency ?? "KRW",
      };

      for (const line of cart) {
        const item = itemRecords.find((record) => record.id === line.itemId);
        if (!item) {
          throw new Error("ITEM_NOT_FOUND");
        }

        const updatedCount = await tx.item.updateMany({
          where: {
            id: item.id,
            currentStock: { gte: line.quantity },
          },
          data: { currentStock: { decrement: line.quantity } },
        });

        if (updatedCount.count === 0) {
          throw new Error("OUT_OF_STOCK");
        }

        await tx.consumption.create({
          data: {
            userId,
            itemId: item.id,
            quantity: line.quantity,
            priceAtTxCents: item.priceCents,
            currency: item.currency,
          },
        });

        await tx.stockMovement.create({
          data: {
            itemId: item.id,
            type: StockMovementType.CONSUME,
            quantity: line.quantity,
            byUserId: actor.id,
          },
        });

        totals.totalCents += item.priceCents * line.quantity;
        totals.currency = item.currency;
      }

      return totals;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const authResponse = authErrorToResponse(error);
    if (authResponse) {
      return authResponse;
    }

    if (error instanceof Error) {
      if (error.message === "USER_NOT_FOUND") {
        return NextResponse.json(
          { error: { code: "USER_NOT_FOUND", message: "Selected member is not active." } },
          { status: 404 },
        );
      }

      if (error.message === "ITEM_NOT_FOUND") {
        return NextResponse.json(
          { error: { code: "ITEM_NOT_FOUND", message: "One or more items are unavailable." } },
          { status: 404 },
        );
      }

      if (error.message === "OUT_OF_STOCK") {
        return NextResponse.json(
          { error: { code: "OUT_OF_STOCK", message: "Not enough stock to fulfill the cart." } },
          { status: 409 },
        );
      }
    }

    console.error(error);
    return NextResponse.json(
      { error: { code: "SERVER_ERROR", message: "Could not record purchase." } },
      { status: 500 },
    );
  }
}
