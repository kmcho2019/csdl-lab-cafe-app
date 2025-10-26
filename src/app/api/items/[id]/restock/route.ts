import { LedgerCategory, StockMovementType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { formatCurrency } from "@/lib/currency";
import { env } from "@/lib/env";
import { requireAdmin } from "@/server/auth/guards";
import { prisma } from "@/server/db/client";

const restockSchema = z.object({
  quantity: z.coerce.number().int().positive(),
  unitCostCents: z.coerce.number().int().min(0).optional(),
  note: z.string().max(200).optional(),
  ledgerDescription: z.string().max(200).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin();
  const user = session.user!;
  const { id } = await context.params;

  const parsed = restockSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_BODY", details: parsed.error.flatten() } },
      { status: 400 },
    );
  }

  const { quantity, unitCostCents, note, ledgerDescription } = parsed.data;

  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Item not found" } },
      { status: 404 },
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const newItem = await tx.item.update({
      where: { id: item.id },
      data: { currentStock: { increment: quantity } },
    });

    await tx.stockMovement.create({
      data: {
        itemId: item.id,
        type: StockMovementType.RESTOCK,
        quantity,
        unitCostCents,
        note,
        byUserId: user.id,
      },
    });

    if (unitCostCents && unitCostCents > 0) {
      await tx.ledgerEntry.create({
        data: {
          description:
            ledgerDescription ??
            `Restock ${item.name} (${quantity} @ ${formatCurrency(unitCostCents, item.currency, { locale: env.APP_LOCALE })} each)`,
          amountCents: -1 * unitCostCents * quantity,
          category: LedgerCategory.PURCHASE,
          userId: user.id,
        },
      });
    }

    return newItem;
  });

  return NextResponse.json({ item: updated });
}
