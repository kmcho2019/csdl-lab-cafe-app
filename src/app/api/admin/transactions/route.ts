import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/server/auth/guards";
import { authErrorToResponse } from "@/server/auth/http";
import { prisma } from "@/server/db/client";

const transactionQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  userId: z.string().optional(),
  includeReversed: z.coerce.boolean().optional().default(true),
});

export async function GET(request: Request) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const parsed = transactionQuerySchema.safeParse({
      limit: searchParams.get("limit"),
      cursor: searchParams.get("cursor") ?? undefined,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      userId: searchParams.get("userId") ?? undefined,
      includeReversed: searchParams.get("includeReversed") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "INVALID_QUERY", details: parsed.error.flatten() } },
        { status: 400 },
      );
    }

    const { limit, cursor, from, to, userId, includeReversed } = parsed.data;
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;

    const consumptions = await prisma.consumption.findMany({
      where: {
        ...(userId ? { userId } : {}),
        ...(includeReversed ? {} : { reversedAt: null }),
        ...(fromDate || toDate
          ? {
              createdAt: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate ? { lte: toDate } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        user: { select: { id: true, name: true, email: true } },
        item: { select: { id: true, name: true } },
      },
    });

    const hasMore = consumptions.length > limit;
    const sliced = hasMore ? consumptions.slice(0, limit) : consumptions;
    const nextCursor = hasMore ? sliced[sliced.length - 1]?.id ?? null : null;

    return NextResponse.json({
      nextCursor,
      transactions: sliced.map((consumption) => {
        const chargedCents = consumption.priceAtTxCents * consumption.quantity;
        return {
          id: consumption.id,
          createdAt: consumption.createdAt.toISOString(),
          reversedAt: consumption.reversedAt?.toISOString() ?? null,
          settlementId: consumption.settlementId,
          user: consumption.user,
          item: consumption.item,
          quantity: consumption.quantity,
          unitPriceCents: consumption.priceAtTxCents,
          currency: consumption.currency,
          chargedCents,
          stockDeltaUnits: -1 * consumption.quantity,
          owedDeltaCents: chargedCents,
          reversal: consumption.reversedAt
            ? {
                stockDeltaUnits: consumption.quantity,
                owedDeltaCents: -1 * chargedCents,
              }
            : null,
        };
      }),
    });
  } catch (error) {
    const authResponse = authErrorToResponse(error);
    if (authResponse) {
      return authResponse;
    }

    console.error(error);
    return NextResponse.json(
      { error: { code: "SERVER_ERROR", message: "Unable to load transactions." } },
      { status: 500 },
    );
  }
}
