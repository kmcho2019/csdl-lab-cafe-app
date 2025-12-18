import { Role } from "@prisma/client";
import { redirect } from "next/navigation";

import { RestockManager } from "@/components/restocks/restock-manager";
import { env } from "@/lib/env";
import { getAuthSession } from "@/server/auth/session";
import { prisma } from "@/server/db/client";

export default async function RestocksPage() {
  const session = await getAuthSession();
  if (!session?.user) {
    redirect("/api/auth/signin");
  }

  if (session.user.role !== Role.ADMIN) {
    redirect("/app");
  }

  const [items, purchaseOrders] = await Promise.all([
    prisma.item.findMany({
      where: { isActive: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        category: true,
        priceCents: true,
        currency: true,
        currentStock: true,
      },
    }),
    prisma.purchaseOrder.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        items: { include: { item: { select: { id: true, name: true } } } },
      },
    }),
  ]);

  return (
    <RestockManager
      currency={env.APP_CURRENCY}
      locale={env.APP_LOCALE}
      items={items.map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        priceCents: item.priceCents,
        currency: item.currency,
        currentStock: item.currentStock,
      }))}
      initialPurchaseOrders={purchaseOrders.map((order) => ({
        id: order.id,
        vendorName: order.vendorName,
        purchaseChannel: order.purchaseChannel ?? "",
        receiptPath: order.receiptPath ?? "",
        comment: order.comment ?? "",
        miscCostCents: order.miscCostCents ?? 0,
        miscComment: order.miscComment ?? "",
        status: order.status,
        createdAt: order.createdAt.toISOString(),
        totalCostCents: order.totalCostCents ?? 0,
        createdBy: order.createdBy,
        items: order.items.map((line) => ({
          id: line.id,
          itemId: line.itemId,
          itemName: line.item.name,
          quantity: line.quantity,
          unitCostCents: line.unitCostCents,
        })),
      }))}
    />
  );
}

