import { Role } from "@prisma/client";
import { redirect } from "next/navigation";

import { SettlementsManager } from "@/components/settlements/settlements-manager";
import { env } from "@/lib/env";
import { getAuthSession } from "@/server/auth/session";
import { prisma } from "@/server/db/client";

export default async function SettlementsPage() {
  const session = await getAuthSession();
  if (!session?.user) {
    redirect("/api/auth/signin");
  }

  if (session.user.role !== Role.ADMIN) {
    redirect("/app");
  }

  const settlements = await prisma.settlement.findMany({
    orderBy: { startDate: "desc" },
    take: 25,
    include: {
      _count: {
        select: { consumptions: true, lines: true, payments: true },
      },
    },
  });

  return (
    <SettlementsManager
      locale={env.APP_LOCALE}
      currency={env.APP_CURRENCY}
      initialSettlements={settlements.map((settlement) => ({
        id: settlement.id,
        number: settlement.number,
        startDate: settlement.startDate.toISOString(),
        endDate: settlement.endDate.toISOString(),
        status: settlement.status,
        notes: settlement.notes ?? "",
        createdAt: settlement.createdAt.toISOString(),
        finalizedAt: settlement.finalizedAt?.toISOString() ?? null,
        counts: settlement._count,
      }))}
    />
  );
}
