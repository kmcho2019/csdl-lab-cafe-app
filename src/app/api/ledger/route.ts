import { LedgerCategory } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { hasControlCharacters } from "@/lib/text";
import { requireAdmin } from "@/server/auth/guards";
import { authErrorToResponse } from "@/server/auth/http";
import { prisma } from "@/server/db/client";

const listLedgerQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

const createLedgerEntrySchema = z.object({
  timestamp: z.string().datetime().optional(),
  description: z
    .string()
    .min(1)
    .max(200)
    .refine((value) => !hasControlCharacters(value), {
      message: "Description must not include control characters.",
    }),
  amountCents: z.coerce.number().int().refine((value) => value !== 0, {
    message: "Amount cannot be zero.",
  }),
  category: z.nativeEnum(LedgerCategory),
});

export async function GET(request: Request) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const parsed = listLedgerQuerySchema.safeParse({
      limit: searchParams.get("limit"),
      cursor: searchParams.get("cursor") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "INVALID_QUERY", details: parsed.error.flatten() } },
        { status: 400 },
      );
    }

    const { limit, cursor } = parsed.data;

    const entries = await prisma.ledgerEntry.findMany({
      orderBy: [{ timestamp: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        user: true,
        settlement: { select: { number: true } },
        purchaseOrder: { select: { vendorName: true } },
      },
    });

    const hasMore = entries.length > limit;
    const sliced = hasMore ? entries.slice(0, limit) : entries;
    const nextCursor = hasMore ? sliced[sliced.length - 1]?.id ?? null : null;

    const total = await prisma.ledgerEntry.aggregate({
      _sum: { amountCents: true },
    });

    return NextResponse.json({
      currentBalanceCents: total._sum.amountCents ?? 0,
      nextCursor,
      entries: sliced.map((entry) => ({
        id: entry.id,
        timestamp: entry.timestamp.toISOString(),
        description: entry.description,
        amountCents: entry.amountCents,
        category: entry.category,
        balanceAfterCents: entry.balanceAfterCents ?? null,
        user: entry.user ? { id: entry.user.id, name: entry.user.name, email: entry.user.email } : null,
        settlementNumber: entry.settlement?.number ?? null,
        purchaseOrderVendor: entry.purchaseOrder?.vendorName ?? null,
      })),
    });
  } catch (error) {
    const authResponse = authErrorToResponse(error);
    if (authResponse) {
      return authResponse;
    }

    console.error(error);
    return NextResponse.json(
      { error: { code: "SERVER_ERROR", message: "Unable to load ledger." } },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdmin();
    const actor = session.user!;

    const body = await request.json().catch(() => null);
    const parsed = createLedgerEntrySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "INVALID_BODY", details: parsed.error.flatten() } },
        { status: 400 },
      );
    }

    const data = parsed.data;
    const timestamp = data.timestamp ? new Date(data.timestamp) : new Date();

    const entry = await prisma.$transaction(async (tx) => {
      const created = await tx.ledgerEntry.create({
        data: {
          timestamp,
          description: data.description,
          amountCents: data.amountCents,
          category: data.category,
          userId: actor.id,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "LEDGER_ENTRY_CREATED",
          entity: "LedgerEntry",
          entityId: created.id,
          diff: {
            amountCents: created.amountCents,
            category: created.category,
            description: created.description,
            timestamp: created.timestamp.toISOString(),
          },
        },
      });

      return created;
    });

    return NextResponse.json(
      {
        entry: {
          id: entry.id,
          timestamp: entry.timestamp.toISOString(),
          description: entry.description,
          amountCents: entry.amountCents,
          category: entry.category,
          balanceAfterCents: entry.balanceAfterCents ?? null,
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
      { error: { code: "SERVER_ERROR", message: "Unable to create ledger entry." } },
      { status: 500 },
    );
  }
}
