import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/server/auth/guards";
import { authErrorToResponse } from "@/server/auth/http";
import { prisma } from "@/server/db/client";

const listSettlementConsumptionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  includeReversed: z.coerce.boolean().optional().default(true),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await context.params;

    const { searchParams } = new URL(request.url);
    const parsedQuery = listSettlementConsumptionsQuerySchema.safeParse({
      limit: searchParams.get("limit"),
      includeReversed: searchParams.get("includeReversed"),
    });

    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: { code: "INVALID_QUERY", details: parsedQuery.error.flatten() } },
        { status: 400 },
      );
    }

    const { limit, includeReversed } = parsedQuery.data;

    const settlement = await prisma.settlement.findUnique({
      where: { id },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        status: true,
      },
    });

    if (!settlement) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Settlement not found." } },
        { status: 404 },
      );
    }

    const consumptions = await prisma.consumption.findMany({
      where: {
        settlementId: null,
        ...(includeReversed ? {} : { reversedAt: null }),
        createdAt: {
          gte: settlement.startDate,
          lte: settlement.endDate,
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        user: { select: { id: true, name: true, email: true } },
        item: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({
      settlement: {
        id: settlement.id,
        status: settlement.status,
        startDate: settlement.startDate.toISOString(),
        endDate: settlement.endDate.toISOString(),
      },
      consumptions: consumptions.map((consumption) => ({
        id: consumption.id,
        createdAt: consumption.createdAt.toISOString(),
        user: consumption.user,
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
      { error: { code: "SERVER_ERROR", message: "Unable to load settlement consumptions." } },
      { status: 500 },
    );
  }
}

