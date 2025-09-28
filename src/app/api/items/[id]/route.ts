import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/server/auth/guards";
import { prisma } from "@/server/db/client";

const updateItemSchema = z
  .object({
    name: z.string().min(1).optional(),
    priceCents: z.coerce.number().int().positive().optional(),
    category: z.string().max(120).nullable().optional(),
    unit: z.string().max(40).nullable().optional(),
    lowStockThreshold: z.coerce.number().int().min(0).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  await requireAdmin();

  const body = await request.json().catch(() => null);
  const parsed = updateItemSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_BODY", details: parsed.error.flatten() } },
      { status: 400 },
    );
  }

  const updates = parsed.data;

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.item.findUnique({
        where: { id: params.id },
        select: {
          id: true,
          priceCents: true,
          currency: true,
        },
      });

      if (!existing) {
        return null;
      }

      const item = await tx.item.update({
        where: { id: params.id },
        data: {
          name: updates.name,
          priceCents: updates.priceCents,
          category: updates.category === undefined ? undefined : updates.category,
          unit: updates.unit === undefined ? undefined : updates.unit,
          lowStockThreshold: updates.lowStockThreshold,
        },
        select: {
          id: true,
          name: true,
          category: true,
          unit: true,
          priceCents: true,
          currency: true,
          currentStock: true,
          lowStockThreshold: true,
          isActive: true,
        },
      });

      if (updates.priceCents !== undefined && updates.priceCents !== existing.priceCents) {
        await tx.itemPriceHistory.create({
          data: {
            itemId: params.id,
            priceCents: updates.priceCents,
            currency: existing.currency,
          },
        });
      }

      return item;
    });

    if (!updated) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Item not found" } },
        { status: 404 },
      );
    }

    return NextResponse.json({ item: updated });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: { code: "SERVER_ERROR", message: "Unable to update item" } },
      { status: 500 },
    );
  }
}
