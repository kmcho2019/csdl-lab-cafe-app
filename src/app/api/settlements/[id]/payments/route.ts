import { SettlementStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { hasControlCharacters } from "@/lib/text";
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

const paymentToggleSchema = z.object({
  userId: z.string().min(1),
  isPaid: z.coerce.boolean(),
  method: z.string().max(40).optional(),
  reference: z
    .string()
    .max(200)
    .refine((value) => !hasControlCharacters(value), { message: "Reference must not include control characters." })
    .optional(),
});

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

    const payments = await prisma.payment.groupBy({
      by: ["userId"],
      where: { settlementId: settlement.id },
      _sum: { amountCents: true },
    });

    const paidByUser = new Map<string, number>();
    for (const payment of payments) {
      paidByUser.set(payment.userId, payment._sum.amountCents ?? 0);
    }

    const lines = settlement.lines.map((line) => {
      const paidCents = paidByUser.get(line.userId) ?? 0;
      return {
        userId: line.userId,
        userName: line.user.name ?? "",
        userEmail: line.user.email,
        itemCount: line.itemCount,
        totalCents: line.totalCents,
        paidCents,
        isPaid: paidCents >= line.totalCents,
      };
    });

    const totalDueCents = settlement.lines.reduce((sum, line) => sum + line.totalCents, 0);
    const totalPaidCents = payments.reduce((sum, payment) => sum + (payment._sum.amountCents ?? 0), 0);

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
        dueCents: totalDueCents,
        paidCents: totalPaidCents,
      },
      lines,
    });
  } catch (error) {
    const authResponse = authErrorToResponse(error);
    if (authResponse) {
      return authResponse;
    }

    console.error(error);
    return NextResponse.json(
      { error: { code: "SERVER_ERROR", message: "Unable to load settlement payments." } },
      { status: 500 },
    );
  }
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

    const body = await request.json().catch(() => null);
    const parsed = paymentToggleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "INVALID_BODY", details: parsed.error.flatten() } },
        { status: 400 },
      );
    }

    const { userId, isPaid, method, reference } = parsed.data;

    const settlement = await prisma.settlement.findUnique({
      where: { id },
      include: {
        lines: true,
      },
    });

    if (!settlement) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Settlement not found." } },
        { status: 404 },
      );
    }

    if (settlement.status !== SettlementStatus.BILLED) {
      return NextResponse.json(
        { error: { code: "INVALID_STATUS", message: "Payments can only be tracked for billed settlements." } },
        { status: 409 },
      );
    }

    const line = settlement.lines.find((candidate) => candidate.userId === userId);
    if (!line) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Settlement line not found for user." } },
        { status: 404 },
      );
    }

    await prisma.$transaction(async (tx) => {
      if (isPaid) {
        const existing = await tx.payment.aggregate({
          where: { settlementId: settlement.id, userId },
          _sum: { amountCents: true },
        });

        if ((existing._sum.amountCents ?? 0) >= line.totalCents) {
          return;
        }

        await tx.payment.deleteMany({
          where: { settlementId: settlement.id, userId },
        });

        await tx.payment.create({
          data: {
            userId,
            settlementId: settlement.id,
            amountCents: line.totalCents,
            method: method ?? "bank_transfer",
            reference,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: "SETTLEMENT_PAYMENT_MARKED",
            entity: "Settlement",
            entityId: settlement.id,
            diff: {
              userId,
              isPaid: true,
              amountCents: line.totalCents,
              method: method ?? "bank_transfer",
              reference,
            },
            ipAddress,
          },
        });
      } else {
        await tx.payment.deleteMany({
          where: { settlementId: settlement.id, userId },
        });

        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: "SETTLEMENT_PAYMENT_UNMARKED",
            entity: "Settlement",
            entityId: settlement.id,
            diff: { userId, isPaid: false },
            ipAddress,
          },
        });
      }
    });

    const updated = await prisma.settlement.findUnique({
      where: { id: settlement.id },
      include: {
        _count: { select: { consumptions: true, lines: true, payments: true } },
      },
    });

    if (!updated) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Settlement not found." } },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      settlement: {
        id: updated.id,
        number: updated.number,
        startDate: updated.startDate.toISOString(),
        endDate: updated.endDate.toISOString(),
        status: updated.status,
        notes: updated.notes ?? "",
        createdAt: updated.createdAt.toISOString(),
        finalizedAt: updated.finalizedAt?.toISOString() ?? null,
        counts: updated._count,
      },
    });
  } catch (error) {
    const authResponse = authErrorToResponse(error);
    if (authResponse) {
      return authResponse;
    }

    console.error(error);
    return NextResponse.json(
      { error: { code: "SERVER_ERROR", message: "Unable to update settlement payments." } },
      { status: 500 },
    );
  }
}
