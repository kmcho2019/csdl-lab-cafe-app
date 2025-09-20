import { redirect } from "next/navigation";

import { ItemsGrid } from "@/components/items/items-grid";
import { formatCurrency } from "@/lib/currency";
import { env } from "@/lib/env";
import { getAuthSession } from "@/server/auth/session";
import { prisma } from "@/server/db/client";

export default async function DashboardPage() {
  const session = await getAuthSession();
  if (!session?.user) {
    redirect("/api/auth/signin");
  }

  const [items, openTab] = await Promise.all([
    prisma.item.findMany({
      where: { isActive: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
    prisma.consumption.aggregate({
      where: { userId: session.user.id, settlementId: null },
      _sum: { priceAtTxCents: true },
    }),
  ]);

  const openTabCents = openTab._sum.priceAtTxCents ?? 0;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Welcome back, {session.user.name ?? session.user.email}</h1>
        <p className="mt-2 text-sm text-slate-600">
          Grab a snack, and we will keep your tab up to date.
        </p>
        <p className="mt-4 text-sm font-medium text-slate-900">
          Open tab:
          <span className="ml-1 text-brand">
            {formatCurrency(openTabCents, env.APP_CURRENCY, { locale: env.APP_LOCALE })}
          </span>
        </p>
      </section>

      <ItemsGrid
        items={items.map((item) => ({
          id: item.id,
          name: item.name,
          category: item.category,
          unit: item.unit,
          priceCents: item.priceCents,
          currency: item.currency,
          currentStock: item.currentStock,
          lowStockThreshold: item.lowStockThreshold,
        }))}
        locale={env.APP_LOCALE}
      />
    </div>
  );
}
