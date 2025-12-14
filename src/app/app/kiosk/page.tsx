import { redirect } from "next/navigation";

import { KioskScreen } from "@/components/kiosk/kiosk-screen";
import { getAuthSession } from "@/server/auth/session";
import { prisma } from "@/server/db/client";

export default async function KioskPage() {
  const session = await getAuthSession();
  if (!session?.user) {
    redirect("/api/auth/signin");
  }

  const allowUserSelection = session.user.role === "ADMIN";

  const [users, items] = await Promise.all([
    allowUserSelection
      ? prisma.user.findMany({
          where: { isActive: true },
          select: { id: true, name: true, email: true },
          orderBy: [{ name: "asc" }, { email: "asc" }],
        })
      : Promise.resolve([]),
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

  const currentUserLabel = session.user.name
    ? session.user.email
      ? `${session.user.name} (${session.user.email})`
      : session.user.name
    : session.user.email ?? "Current user";

  return (
    <KioskScreen
      currentUser={{
        id: session.user.id,
        label: currentUserLabel,
      }}
      allowUserSelection={allowUserSelection}
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
