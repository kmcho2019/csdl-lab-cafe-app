import { SettlementStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/server/auth/guards";
import { authErrorToResponse } from "@/server/auth/http";
import { prisma } from "@/server/db/client";
import { computeSettlementPreviewLines } from "@/server/settlements/compute";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await context.params;

    const result = await prisma.$transaction(async (tx) => {
      const settlement = await tx.settlement.findUnique({
        where: { id },
        include: {
          _count: { select: { payments: true } },
        },
      });

      if (!settlement) {
        throw new Error("NOT_FOUND");
      }

      if (settlement.status !== SettlementStatus.DRAFT) {
        throw new Error("INVALID_STATUS");
      }

      if (settlement._count.payments > 0) {
        throw new Error("HAS_PAYMENTS");
      }

      const consumptions = await tx.consumption.findMany({
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
      });

      const previewLines = computeSettlementPreviewLines(
        consumptions.map((consumption) => ({
          userId: consumption.userId,
          user: consumption.user,
          itemId: consumption.itemId,
          item: consumption.item,
          quantity: consumption.quantity,
          priceAtTxCents: consumption.priceAtTxCents,
        })),
      );

      if (consumptions.length > 0) {
        await tx.consumption.updateMany({
          where: {
            id: { in: consumptions.map((consumption) => consumption.id) },
            settlementId: null,
          },
          data: {
            settlementId: settlement.id,
          },
        });
      }

      for (const line of previewLines) {
        await tx.settlementLine.create({
          data: {
            settlementId: settlement.id,
            userId: line.userId,
            itemCount: line.itemCount,
            totalCents: line.totalCents,
            breakdownJson: { items: line.breakdown },
          },
        });
      }

      const updated = await tx.settlement.update({
        where: { id: settlement.id },
        data: {
          status: SettlementStatus.FINALIZED,
          finalizedAt: new Date(),
        },
        include: {
          _count: {
            select: { consumptions: true, lines: true, payments: true },
          },
        },
      });

      return {
        settlement: updated,
      };
    });

    return NextResponse.json({
      settlement: {
        id: result.settlement.id,
        number: result.settlement.number,
        startDate: result.settlement.startDate.toISOString(),
        endDate: result.settlement.endDate.toISOString(),
        status: result.settlement.status,
        notes: result.settlement.notes ?? "",
        createdAt: result.settlement.createdAt.toISOString(),
        finalizedAt: result.settlement.finalizedAt?.toISOString() ?? null,
        counts: result.settlement._count,
      },
    });
  } catch (error) {
    const authResponse = authErrorToResponse(error);
    if (authResponse) {
      return authResponse;
    }

    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Settlement not found." } },
          { status: 404 },
        );
      }

      if (error.message === "INVALID_STATUS") {
        return NextResponse.json(
          {
            error: {
              code: "INVALID_STATUS",
              message: "Only draft settlements can be finalized.",
            },
          },
          { status: 409 },
        );
      }

      if (error.message === "HAS_PAYMENTS") {
        return NextResponse.json(
          {
            error: {
              code: "HAS_PAYMENTS",
              message: "This settlement already has payments and cannot be finalized again.",
            },
          },
          { status: 409 },
        );
      }
    }

    console.error(error);
    return NextResponse.json(
      { error: { code: "SERVER_ERROR", message: "Unable to finalize settlement." } },
      { status: 500 },
    );
  }
}

