import { SettlementStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/server/auth/guards";
import { authErrorToResponse } from "@/server/auth/http";
import { prisma } from "@/server/db/client";
import { getMonthRangeUtc } from "@/server/settlements/period";

import { createSettlementSchema } from "./schema";

export async function GET() {
  try {
    await requireAdmin();

    const settlements = await prisma.settlement.findMany({
      orderBy: { startDate: "desc" },
      take: 25,
      include: {
        _count: {
          select: { consumptions: true, lines: true, payments: true },
        },
      },
    });

    return NextResponse.json({
      settlements: settlements.map((settlement) => ({
        id: settlement.id,
        number: settlement.number,
        startDate: settlement.startDate.toISOString(),
        endDate: settlement.endDate.toISOString(),
        status: settlement.status,
        notes: settlement.notes ?? "",
        createdAt: settlement.createdAt.toISOString(),
        finalizedAt: settlement.finalizedAt?.toISOString() ?? null,
        counts: settlement._count,
      })),
    });
  } catch (error) {
    const authResponse = authErrorToResponse(error);
    if (authResponse) {
      return authResponse;
    }
    console.error(error);
    return NextResponse.json(
      { error: { code: "SERVER_ERROR", message: "Unable to load settlements." } },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdmin();
    const user = session.user!;

    const body = await request.json().catch(() => null);
    const parsed = createSettlementSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "INVALID_BODY", details: parsed.error.flatten() } },
        { status: 400 },
      );
    }

    const { month, notes } = parsed.data;
    const { startDate, endDate } = getMonthRangeUtc(month);

    const existing = await prisma.settlement.findFirst({
      where: {
        startDate,
        endDate,
        status: { not: SettlementStatus.VOID },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: { code: "CONFLICT", message: "A settlement already exists for that month." } },
        { status: 409 },
      );
    }

    const settlement = await prisma.settlement.create({
      data: {
        startDate,
        endDate,
        status: SettlementStatus.DRAFT,
        notes,
        createdById: user.id,
      },
      include: {
        _count: {
          select: { consumptions: true, lines: true, payments: true },
        },
      },
    });

    return NextResponse.json(
      {
        settlement: {
          id: settlement.id,
          number: settlement.number,
          startDate: settlement.startDate.toISOString(),
          endDate: settlement.endDate.toISOString(),
          status: settlement.status,
          notes: settlement.notes ?? "",
          createdAt: settlement.createdAt.toISOString(),
          finalizedAt: settlement.finalizedAt?.toISOString() ?? null,
          counts: settlement._count,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const authResponse = authErrorToResponse(error);
    if (authResponse) {
      return authResponse;
    }
    console.error(error);
    return NextResponse.json(
      { error: { code: "SERVER_ERROR", message: "Unable to create settlement." } },
      { status: 500 },
    );
  }
}

