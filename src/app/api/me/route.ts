import { NextResponse } from "next/server";

import { formatCurrency } from "@/lib/currency";
import { env } from "@/lib/env";
import { requireSession } from "@/server/auth/guards";
import { authErrorToResponse } from "@/server/auth/http";
import { prisma } from "@/server/db/client";

export async function GET() {
  try {
    const session = await requireSession();
    const user = session.user!;

    const consumptions = await prisma.consumption.findMany({
      where: { userId: user.id, settlementId: null, reversedAt: null },
      select: { priceAtTxCents: true, quantity: true },
    });

    const openTabCents = consumptions.reduce((sum, consumption) => sum + consumption.priceAtTxCents * consumption.quantity, 0);

    return NextResponse.json({
      user: {
        id: user.id,
        name: session.user?.name,
        email: session.user?.email,
        role: user.role,
        isActive: user.isActive,
        openTabCents,
        openTabFormatted: formatCurrency(openTabCents, env.APP_CURRENCY, {
          locale: env.APP_LOCALE,
        }),
        currency: env.APP_CURRENCY,
      },
    });
  } catch (error) {
    const authResponse = authErrorToResponse(error);
    if (authResponse) {
      return authResponse;
    }

    console.error(error);
    return NextResponse.json(
      { error: { code: "SERVER_ERROR", message: "Unable to load profile." } },
      { status: 500 },
    );
  }
}
