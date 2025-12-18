import { LedgerCategory, SettlementStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/server/auth/guards";
import { authErrorToResponse } from "@/server/auth/http";
import { prisma } from "@/server/db/client";

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

    const ipAddress = getRequestIp(request);

    const result = await prisma.$transaction(async (tx) => {
      const settlement = await tx.settlement.findUnique({
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
        throw new Error("NOT_FOUND");
      }

      if (settlement.status !== SettlementStatus.BILLED) {
        throw new Error("INVALID_STATUS");
      }

      const payments = await tx.payment.groupBy({
        by: ["userId"],
        where: { settlementId: settlement.id },
        _sum: { amountCents: true },
      });

      const paidByUser = new Map<string, number>();
      for (const payment of payments) {
        paidByUser.set(payment.userId, payment._sum.amountCents ?? 0);
      }

      const unpaid = settlement.lines.filter((line) => (paidByUser.get(line.userId) ?? 0) < line.totalCents);
      if (unpaid.length > 0) {
        throw new Error("UNPAID");
      }

      const totalCents = settlement.lines.reduce((sum, line) => sum + line.totalCents, 0);
      const finalizedStamp = new Date().toISOString().slice(0, 10).replaceAll("-", ":");

      await tx.ledgerEntry.create({
        data: {
          timestamp: new Date(),
          description: `Settlement #${settlement.number} of ${finalizedStamp} finalized`,
          amountCents: totalCents,
          category: LedgerCategory.SETTLEMENT,
          settlementId: settlement.id,
          userId: actor.id,
        },
      });

      const updated = await tx.settlement.update({
        where: { id: settlement.id },
        data: {
          status: SettlementStatus.FINALIZED,
          finalizedAt: new Date(),
        },
        include: {
          _count: { select: { consumptions: true, lines: true, payments: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "SETTLEMENT_FINALIZED",
          entity: "Settlement",
          entityId: settlement.id,
          diff: {
            settlementNumber: settlement.number,
            totalCents,
            lineCount: settlement.lines.length,
          },
          ipAddress,
        },
      });

      return updated;
    });

    return NextResponse.json({
      settlement: {
        id: result.id,
        number: result.number,
        startDate: result.startDate.toISOString(),
        endDate: result.endDate.toISOString(),
        status: result.status,
        notes: result.notes ?? "",
        createdAt: result.createdAt.toISOString(),
        finalizedAt: result.finalizedAt?.toISOString() ?? null,
        counts: result._count,
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
          { error: { code: "INVALID_STATUS", message: "Only billed settlements can be finalized." } },
          { status: 409 },
        );
      }

      if (error.message === "UNPAID") {
        return NextResponse.json(
          { error: { code: "UNPAID", message: "All members must be marked paid before finalizing." } },
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
