import { NextResponse } from "next/server";

import { requireSession } from "@/server/auth/guards";
import { prisma } from "@/server/db/client";

export async function GET() {
  const session = await requireSession();
  const user = session.user!;

  const tab = await prisma.consumption.aggregate({
    where: { userId: user.id, settlementId: null },
    _sum: { priceAtTxCents: true },
  });

  return NextResponse.json({
    user: {
      id: user.id,
      name: session.user?.name,
      email: session.user?.email,
      role: user.role,
      isActive: user.isActive,
      openTabCents: tab._sum.priceAtTxCents ?? 0,
    },
  });
}
