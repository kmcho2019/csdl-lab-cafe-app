import { SettlementStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { requireAdmin } from "@/server/auth/guards";
import { authErrorToResponse } from "@/server/auth/http";
import { prisma } from "@/server/db/client";
import { computeSettlementPreviewLines, type SettlementBreakdownItem, type SettlementPreviewLine } from "@/server/settlements/compute";
import { buildSettlementAccountingCsv } from "@/server/settlements/export";

function formatIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseBreakdownJson(value: unknown): SettlementBreakdownItem[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  const items = (value as { items?: unknown }).items;
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const candidate = item as Partial<SettlementBreakdownItem>;
      if (
        typeof candidate.itemId !== "string" ||
        typeof candidate.itemName !== "string" ||
        typeof candidate.quantity !== "number" ||
        typeof candidate.unitPriceCents !== "number" ||
        typeof candidate.totalCents !== "number"
      ) {
        return null;
      }

      return {
        itemId: candidate.itemId,
        itemName: candidate.itemName,
        quantity: candidate.quantity,
        unitPriceCents: candidate.unitPriceCents,
        totalCents: candidate.totalCents,
      } satisfies SettlementBreakdownItem;
    })
    .filter((item): item is SettlementBreakdownItem => Boolean(item));
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await context.params;

    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") ?? "csv";

    if (format !== "csv") {
      return NextResponse.json(
        { error: { code: "INVALID_FORMAT", message: "Only CSV export is supported right now." } },
        { status: 400 },
      );
    }

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

    let lines: SettlementPreviewLine[];

    if ((settlement.status === SettlementStatus.FINALIZED || settlement.status === SettlementStatus.BILLED) && settlement.lines.length > 0) {
      lines = settlement.lines.map((line) => ({
        userId: line.userId,
        userName: line.user.name ?? "",
        userEmail: line.user.email,
        itemCount: line.itemCount,
        totalCents: line.totalCents,
        breakdown: parseBreakdownJson(line.breakdownJson),
      }));
    } else {
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
      });

      lines = computeSettlementPreviewLines(
        consumptions.map((consumption) => ({
          userId: consumption.userId,
          user: consumption.user,
          itemId: consumption.itemId,
          item: consumption.item,
          quantity: consumption.quantity,
          priceAtTxCents: consumption.priceAtTxCents,
        })),
      );
    }

    const csv = buildSettlementAccountingCsv({
      settlementNumber: settlement.number,
      startDate: settlement.startDate,
      endDate: settlement.endDate,
      currency: env.APP_CURRENCY,
      generatedAt: new Date(),
      lines,
    });

    const filename = `settlement_${settlement.number}_${formatIsoDate(settlement.startDate)}__${formatIsoDate(settlement.endDate)}.csv`;

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=\"${filename}\"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const authResponse = authErrorToResponse(error);
    if (authResponse) {
      return authResponse;
    }
    console.error(error);
    return NextResponse.json(
      { error: { code: "SERVER_ERROR", message: "Unable to export settlement." } },
      { status: 500 },
    );
  }
}
