import { Role } from "@prisma/client";
import { redirect } from "next/navigation";

import { InventoryManager } from "@/components/inventory/inventory-manager";
import { env } from "@/lib/env";
import { getAuthSession } from "@/server/auth/session";
import { prisma } from "@/server/db/client";

export default async function InventoryPage() {
  const session = await getAuthSession();
  if (!session?.user) {
    redirect("/api/auth/signin");
  }

  if (session.user.role !== Role.ADMIN) {
    redirect("/app");
  }

  const items = await prisma.item.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  return (
    <InventoryManager
      items={items.map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        unit: item.unit,
        priceCents: item.priceCents,
        currency: item.currency,
        currentStock: item.currentStock,
        lowStockThreshold: item.lowStockThreshold,
        isActive: item.isActive,
      }))}
      locale={env.APP_LOCALE}
      currency={env.APP_CURRENCY}
    />
  );
}
