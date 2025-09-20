import { LedgerCategory, StockMovementType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/server/auth/guards";
import { prisma } from "@/server/db/client";

const writeOffSchema = z.object({
  quantity: z.coerce.number().int().positive(),
  reason: z.string().max(200).optional(),
  ledgerDescription: z.string().max(200).optional(),
  recordLedger: z.coerce.boolean().optional().default(false),
});

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await requireAdmin();
  const user = session.user!;

  const parsed = writeOffSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_BODY", details: parsed.error.flatten() } },
      { status: 400 },
    );
  }

  const { quantity, reason, ledgerDescription, recordLedger } = parsed.data;

  const item = await prisma.item.findUnique({ where: { id: params.id } });
  if (!item) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Item not found" } },
      { status: 404 },
    );
  }

  if (item.currentStock < quantity) {
    return NextResponse.json(
      { error: { code: "INVALID_QUANTITY", message: "Cannot write off more than current stock" } },
      { status: 409 },
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const newItem = await tx.item.update({
      where: { id: item.id },
      data: { currentStock: { decrement: quantity } },
    });

    await tx.stockMovement.create({
      data: {
        itemId: item.id,
        type: StockMovementType.WRITE_OFF,
        quantity,
        note: reason,
        byUserId: user.id,
      },
    });

    if (recordLedger) {
      await tx.ledgerEntry.create({
        data: {
          description: ledgerDescription ?? `Write-off ${item.name} (${quantity})`,
          amountCents: -1 * item.priceCents * quantity,
          category: LedgerCategory.WRITE_OFF,
          userId: user.id,
        },
      });
    }

    return newItem;
  });

  return NextResponse.json({ item: updated });
}
