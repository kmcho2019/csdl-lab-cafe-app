import { LedgerCategory, PurchaseOrderStatus, StockMovementType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/server/auth/guards";
import { authErrorToResponse } from "@/server/auth/http";
import { prisma } from "@/server/db/client";

const listPurchaseOrdersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

const restockLineSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
  unitCostCents: z.coerce.number().int().min(0),
});

const createPurchaseOrderSchema = z.object({
  vendorName: z.string().min(1).max(120),
  purchaseChannel: z.string().max(80).optional(),
  receiptPath: z
    .string()
    .max(500)
    .refine((value) => /^[\x20-\x7E]*$/.test(value), { message: "Receipt path must be ASCII." })
    .optional(),
  comment: z
    .string()
    .max(200)
    .refine((value) => /^[\x20-\x7E]*$/.test(value), { message: "Comment must be ASCII." })
    .optional(),
  miscCostCents: z.coerce.number().int().min(0).default(0),
  miscComment: z
    .string()
    .max(200)
    .refine((value) => /^[\x20-\x7E]*$/.test(value), { message: "Misc comment must be ASCII." })
    .optional(),
  lines: z.array(restockLineSchema).min(1).max(50),
});

export async function GET(request: Request) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const parsed = listPurchaseOrdersQuerySchema.safeParse({
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

    const orders = await prisma.purchaseOrder.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        items: {
          include: { item: { select: { id: true, name: true } } },
          orderBy: { item: { name: "asc" } },
        },
      },
    });

    const hasMore = orders.length > limit;
    const sliced = hasMore ? orders.slice(0, limit) : orders;
    const nextCursor = hasMore ? sliced[sliced.length - 1]?.id ?? null : null;

    return NextResponse.json({
      nextCursor,
      purchaseOrders: sliced.map((order) => ({
        id: order.id,
        vendorName: order.vendorName,
        purchaseChannel: order.purchaseChannel ?? "",
        receiptPath: order.receiptPath ?? "",
        comment: order.comment ?? "",
        miscCostCents: order.miscCostCents ?? 0,
        miscComment: order.miscComment ?? "",
        status: order.status,
        orderedAt: order.orderedAt?.toISOString() ?? null,
        receivedAt: order.receivedAt?.toISOString() ?? null,
        totalCostCents: order.totalCostCents ?? null,
        createdAt: order.createdAt.toISOString(),
        createdBy: order.createdBy,
        items: order.items.map((line) => ({
          id: line.id,
          itemId: line.itemId,
          itemName: line.item.name,
          quantity: line.quantity,
          unitCostCents: line.unitCostCents,
        })),
      })),
    });
  } catch (error) {
    const authResponse = authErrorToResponse(error);
    if (authResponse) {
      return authResponse;
    }

    console.error(error);
    return NextResponse.json(
      { error: { code: "SERVER_ERROR", message: "Unable to load purchase orders." } },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdmin();
    const actor = session.user!;

    const body = await request.json().catch(() => null);
    const parsed = createPurchaseOrderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "INVALID_BODY", details: parsed.error.flatten() } },
        { status: 400 },
      );
    }

    const data = parsed.data;

    const uniqueItemIds = new Set<string>();
    for (const line of data.lines) {
      if (uniqueItemIds.has(line.itemId)) {
        return NextResponse.json(
          { error: { code: "DUPLICATE_ITEM", message: "Each item may only appear once in a purchase order." } },
          { status: 400 },
        );
      }
      uniqueItemIds.add(line.itemId);
    }

    const itemIds = Array.from(uniqueItemIds);
    const items = await prisma.item.findMany({
      where: { id: { in: itemIds }, isActive: true },
      select: { id: true, name: true, currency: true },
    });

    if (items.length !== itemIds.length) {
      return NextResponse.json(
        { error: { code: "ITEM_NOT_FOUND", message: "One or more items were not found or are archived." } },
        { status: 404 },
      );
    }

    const totalLinesCents = data.lines.reduce((sum, line) => sum + line.unitCostCents * line.quantity, 0);
    const totalCostCents = totalLinesCents + (data.miscCostCents ?? 0);

    const purchaseOrder = await prisma.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.create({
        data: {
          vendorName: data.vendorName,
          purchaseChannel: data.purchaseChannel,
          receiptPath: data.receiptPath,
          comment: data.comment,
          miscCostCents: data.miscCostCents,
          miscComment: data.miscComment,
          status: PurchaseOrderStatus.RECEIVED,
          orderedAt: new Date(),
          receivedAt: new Date(),
          totalCostCents,
          createdById: actor.id,
          items: {
            create: data.lines.map((line) => ({
              itemId: line.itemId,
              quantity: line.quantity,
              unitCostCents: line.unitCostCents,
            })),
          },
        },
        include: {
          items: { include: { item: { select: { id: true, name: true } } } },
        },
      });

      for (const line of data.lines) {
        await tx.item.update({
          where: { id: line.itemId },
          data: { currentStock: { increment: line.quantity } },
        });

        await tx.stockMovement.create({
          data: {
            itemId: line.itemId,
            type: StockMovementType.RESTOCK,
            quantity: line.quantity,
            unitCostCents: line.unitCostCents,
            byUserId: actor.id,
            relatedPOId: order.id,
            note: `Central restock (${order.vendorName})`,
          },
        });
      }

      const descriptionBase = data.comment ? `Restock ${order.vendorName} — ${data.comment}` : `Restock ${order.vendorName}`;

      await tx.ledgerEntry.create({
        data: {
          timestamp: new Date(),
          description: descriptionBase.slice(0, 200),
          amountCents: -1 * totalCostCents,
          category: LedgerCategory.PURCHASE,
          purchaseOrderId: order.id,
          userId: actor.id,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "PURCHASE_ORDER_RECEIVED",
          entity: "PurchaseOrder",
          entityId: order.id,
          diff: {
            vendorName: order.vendorName,
            totalCostCents,
            lineCount: data.lines.length,
            miscCostCents: data.miscCostCents ?? 0,
          },
        },
      });

      return order;
    });

    return NextResponse.json(
      {
        purchaseOrder: {
          id: purchaseOrder.id,
          vendorName: purchaseOrder.vendorName,
          purchaseChannel: purchaseOrder.purchaseChannel ?? "",
          receiptPath: purchaseOrder.receiptPath ?? "",
          comment: purchaseOrder.comment ?? "",
          miscCostCents: purchaseOrder.miscCostCents ?? 0,
          miscComment: purchaseOrder.miscComment ?? "",
          status: purchaseOrder.status,
          orderedAt: purchaseOrder.orderedAt?.toISOString() ?? null,
          receivedAt: purchaseOrder.receivedAt?.toISOString() ?? null,
          totalCostCents: purchaseOrder.totalCostCents ?? null,
          createdAt: purchaseOrder.createdAt.toISOString(),
          items: purchaseOrder.items.map((line) => ({
            id: line.id,
            itemId: line.itemId,
            itemName: line.item.name,
            quantity: line.quantity,
            unitCostCents: line.unitCostCents,
          })),
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
      { error: { code: "SERVER_ERROR", message: "Unable to create purchase order." } },
      { status: 500 },
    );
  }
}

