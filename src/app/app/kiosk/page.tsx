import { Role } from "@prisma/client";
import { redirect } from "next/navigation";

import { KioskScreen } from "@/components/kiosk/kiosk-screen";
import { getAuthSession } from "@/server/auth/session";
import { prisma } from "@/server/db/client";

export default async function KioskPage() {
  const session = await getAuthSession();
  if (!session?.user) {
    redirect("/api/auth/signin");
  }

  if (session.user.role !== Role.ADMIN) {
    redirect("/app");
  }

  const [users, items] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    }),
    prisma.item.findMany({
      where: { isActive: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        category: true,
        unit: true,
        priceCents: true,
        currency: true,
        currentStock: true,
        lowStockThreshold: true,
      },
    }),
  ]);

  return (
    <KioskScreen
      users={users.map((user) => ({
        id: user.id,
        label: user.name ? `${user.name} (${user.email})` : user.email,
      }))}
      items={items.map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category ?? "Uncategorized",
        unit: item.unit,
        priceCents: item.priceCents,
        currency: item.currency,
        currentStock: item.currentStock,
        lowStockThreshold: item.lowStockThreshold,
      }))}
    />
  );
}

