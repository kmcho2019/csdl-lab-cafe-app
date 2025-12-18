import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/server/auth/guards";
import { authErrorToResponse } from "@/server/auth/http";
import { prisma } from "@/server/db/client";

type WindowKey = "7d" | "30d" | "90d";

const summaryQuerySchema = z.object({
  window: z.enum(["7d", "30d", "90d"]).optional(),
});

function getWindowDays(windowKey: WindowKey | undefined): { key: WindowKey; days: number } {
  if (windowKey === "7d") return { key: "7d", days: 7 };
  if (windowKey === "90d") return { key: "90d", days: 90 };
  return { key: "30d", days: 30 };
}

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function utcRangeForDays(days: number) {
  const now = new Date();
  const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  startDate.setUTCDate(startDate.getUTCDate() - (days - 1));
  return { startDate, endDate };
}

export async function GET(request: Request) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const parsed = summaryQuerySchema.safeParse({ window: searchParams.get("window") ?? undefined });
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "INVALID_QUERY", details: parsed.error.flatten() } },
        { status: 400 },
      );
    }

    const windowConfig = getWindowDays(parsed.data.window as WindowKey | undefined);
    const { startDate, endDate } = utcRangeForDays(windowConfig.days);

    const [currentBalance, priorBalance, entries] = await Promise.all([
      prisma.ledgerEntry.aggregate({ _sum: { amountCents: true } }),
      prisma.ledgerEntry.aggregate({
        where: { timestamp: { lt: startDate } },
        _sum: { amountCents: true },
      }),
      prisma.ledgerEntry.findMany({
        where: { timestamp: { gte: startDate, lte: endDate } },
        select: { amountCents: true, timestamp: true },
        orderBy: { timestamp: "asc" },
      }),
    ]);

    const deltasByDay = new Map<string, number>();
    for (const entry of entries) {
      const dayKey = isoDay(entry.timestamp);
      deltasByDay.set(dayKey, (deltasByDay.get(dayKey) ?? 0) + entry.amountCents);
    }

    const labels: string[] = [];
    const values: number[] = [];
    let running = priorBalance._sum.amountCents ?? 0;

    for (let cursor = new Date(startDate); cursor <= endDate; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const key = isoDay(cursor);
      labels.push(key);
      running += deltasByDay.get(key) ?? 0;
      values.push(running);
    }

    return NextResponse.json({
      window: windowConfig.key,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      currentBalanceCents: currentBalance._sum.amountCents ?? 0,
      startingBalanceCents: priorBalance._sum.amountCents ?? 0,
      series: { labels, values },
    });
  } catch (error) {
    const authResponse = authErrorToResponse(error);
    if (authResponse) {
      return authResponse;
    }

    console.error(error);
    return NextResponse.json(
      { error: { code: "SERVER_ERROR", message: "Unable to load ledger summary." } },
      { status: 500 },
    );
  }
}

