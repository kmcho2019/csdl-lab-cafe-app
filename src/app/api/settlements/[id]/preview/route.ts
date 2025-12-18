import { SettlementStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/server/auth/guards";
import { authErrorToResponse } from "@/server/auth/http";
import { prisma } from "@/server/db/client";
import { computeSettlementPreviewLines } from "@/server/settlements/compute";

type ItemTotals = {
  itemId: string;
  itemName: string;
  quantity: number;
  totalCents: number;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await context.params;

    const settlement = await prisma.settlement.findUnique({
      where: { id },
      include: {
        lines: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (!settlement) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Settlement not found." } },
        { status: 404 },
      );
    }

    if (settlement.status !== SettlementStatus.DRAFT) {
      return NextResponse.json(
        { error: { code: "INVALID_STATUS", message: "Preview is only available for draft settlements." } },
        { status: 409 },
      );
    }

    const consumptions = await prisma.consumption.findMany({
      where: {
        settlementId: null,
        reversedAt: null,
        createdAt: {
          gte: settlement.startDate,
          lte: settlement.endDate,
        },
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        item: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const lines = computeSettlementPreviewLines(
      consumptions.map((consumption) => ({
        userId: consumption.userId,
        user: consumption.user,
        itemId: consumption.itemId,
        item: consumption.item,
        quantity: consumption.quantity,
        priceAtTxCents: consumption.priceAtTxCents,
      })),
    );

    const totalsByItem = new Map<string, ItemTotals>();
    for (const consumption of consumptions) {
      const existing = totalsByItem.get(consumption.itemId);
      if (existing) {
        existing.quantity += consumption.quantity;
        existing.totalCents += consumption.priceAtTxCents * consumption.quantity;
      } else {
        totalsByItem.set(consumption.itemId, {
          itemId: consumption.itemId,
          itemName: consumption.item.name,
          quantity: consumption.quantity,
          totalCents: consumption.priceAtTxCents * consumption.quantity,
        });
      }
    }

    const itemTotals = Array.from(totalsByItem.values()).sort((a, b) => b.totalCents - a.totalCents || a.itemName.localeCompare(b.itemName));
    const totalCents = itemTotals.reduce((sum, entry) => sum + entry.totalCents, 0);
    const totalItemCount = itemTotals.reduce((sum, entry) => sum + entry.quantity, 0);

    return NextResponse.json({
      settlement: {
        id: settlement.id,
        number: settlement.number,
        startDate: settlement.startDate.toISOString(),
        endDate: settlement.endDate.toISOString(),
        status: settlement.status,
        notes: settlement.notes ?? "",
      },
      totals: {
        totalCents,
        totalItemCount,
        consumptionCount: consumptions.length,
      },
      itemTotals,
      lines,
    });
  } catch (error) {
    const authResponse = authErrorToResponse(error);
    if (authResponse) {
      return authResponse;
    }

    console.error(error);
    return NextResponse.json(
      { error: { code: "SERVER_ERROR", message: "Unable to preview settlement." } },
      { status: 500 },
    );
  }
}

