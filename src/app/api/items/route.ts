import { StockMovementType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/lib/env";
import { requireAdmin, requireSession } from "@/server/auth/guards";
import { prisma } from "@/server/db/client";

const createItemSchema = z.object({
  name: z.string().min(1),
  priceCents: z.coerce.number().int().positive(),
  currency: z.string().length(3).optional(),
  category: z.string().max(120).optional(),
  unit: z.string().max(40).optional(),
  lowStockThreshold: z.coerce.number().int().min(0).default(0),
  currentStock: z.coerce.number().int().min(0).default(0),
});

export async function GET(request: Request) {
  await requireSession();

  const { searchParams } = new URL(request.url);
  const active = searchParams.get("active");

  const items = await prisma.item.findMany({
    where: active == null ? {} : { isActive: active === "true" },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  return NextResponse.json({
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      unit: item.unit,
      priceCents: item.priceCents,
      currency: item.currency,
      currentStock: item.currentStock,
      lowStockThreshold: item.lowStockThreshold,
      isActive: item.isActive,
      lowStock: item.currentStock <= item.lowStockThreshold,
    })),
  });
}

export async function POST(request: Request) {
  const session = await requireAdmin();
  const user = session.user!;

  const parsed = createItemSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_BODY", details: parsed.error.flatten() } },
      { status: 400 },
    );
  }

  const data = parsed.data;

  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.item.create({
      data: {
        name: data.name,
        category: data.category,
        unit: data.unit,
        priceCents: data.priceCents,
        currency: (data.currency ?? env.APP_CURRENCY).toUpperCase(),
        currentStock: data.currentStock,
        lowStockThreshold: data.lowStockThreshold,
        priceHistory: {
          create: {
            priceCents: data.priceCents,
            currency: (data.currency ?? env.APP_CURRENCY).toUpperCase(),
          },
        },
      },
    });

    if (data.currentStock > 0) {
      await tx.stockMovement.create({
        data: {
          itemId: created.id,
          type: StockMovementType.RESTOCK,
          quantity: data.currentStock,
          byUserId: user.id,
          note: `Initial stock load (${data.currentStock} units)`,
        },
      });
    }

    return created;
  });

  return NextResponse.json(
    {
      item,
    },
    { status: 201 },
  );
}
