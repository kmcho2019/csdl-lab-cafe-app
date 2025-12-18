import { StockMovementType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/server/auth/guards";
import { authErrorToResponse } from "@/server/auth/http";
import { prisma } from "@/server/db/client";

const consumptionSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.coerce.number().int().positive().default(1),
});

const listConsumptionQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(25),
  includeReversed: z.coerce.boolean().optional().default(true),
  includeSettled: z.coerce.boolean().optional().default(false),
});

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const user = session.user!;

    const { searchParams } = new URL(request.url);
    const parsedQuery = listConsumptionQuerySchema.safeParse({
      limit: searchParams.get("limit"),
      includeReversed: searchParams.get("includeReversed"),
      includeSettled: searchParams.get("includeSettled"),
    });

    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: { code: "INVALID_QUERY", details: parsedQuery.error.flatten() } },
        { status: 400 },
      );
    }

    const { limit, includeReversed, includeSettled } = parsedQuery.data;

    const consumptions = await prisma.consumption.findMany({
      where: {
        userId: user.id,
        ...(includeSettled ? {} : { settlementId: null }),
        ...(includeReversed ? {} : { reversedAt: null }),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        item: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({
      consumptions: consumptions.map((consumption) => ({
        id: consumption.id,
        createdAt: consumption.createdAt.toISOString(),
        item: consumption.item,
        quantity: consumption.quantity,
        priceAtTxCents: consumption.priceAtTxCents,
        currency: consumption.currency,
        settlementId: consumption.settlementId,
        reversedAt: consumption.reversedAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    const authResponse = authErrorToResponse(error);
    if (authResponse) {
      return authResponse;
    }

    console.error(error);
    return NextResponse.json(
      { error: { code: "SERVER_ERROR", message: "Could not load transactions." } },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const user = session.user!;

    const body = await request.json().catch(() => null);
    const parsed = consumptionSchema.safeParse(body);
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
    const authResponse = authErrorToResponse(error);
    if (authResponse) {
      return authResponse;
    }

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
