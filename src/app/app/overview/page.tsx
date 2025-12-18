import { Role } from "@prisma/client";
import { redirect } from "next/navigation";

import { formatCurrency } from "@/lib/currency";
import { env } from "@/lib/env";
import { getAuthSession } from "@/server/auth/session";
import { prisma } from "@/server/db/client";
import { computeSettlementPreviewLines } from "@/server/settlements/compute";

type ItemTotals = {
  itemId: string;
  itemName: string;
  quantity: number;
  totalCents: number;
};

export default async function OverviewPage() {
  const session = await getAuthSession();
  if (!session?.user) {
    redirect("/api/auth/signin");
  }

  if (session.user.role !== Role.ADMIN) {
    redirect("/app");
  }

  const consumptions = await prisma.consumption.findMany({
    where: { settlementId: null, reversedAt: null },
    include: {
      user: { select: { id: true, name: true, email: true } },
      item: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const lines = computeSettlementPreviewLines(
    consumptions.map((consumption) => ({
      userId: consumption.userId,
      user: consumption.user,
      itemId: consumption.itemId,
      item: consumption.item,
      quantity: consumption.quantity,
      priceAtTxCents: consumption.priceAtTxCents,
    })),
  );

  const totalsByItem = new Map<string, ItemTotals>();
  for (const consumption of consumptions) {
    const existing = totalsByItem.get(consumption.itemId);
    if (existing) {
      existing.quantity += consumption.quantity;
      existing.totalCents += consumption.priceAtTxCents * consumption.quantity;
    } else {
      totalsByItem.set(consumption.itemId, {
        itemId: consumption.itemId,
        itemName: consumption.item.name,
        quantity: consumption.quantity,
        totalCents: consumption.priceAtTxCents * consumption.quantity,
      });
    }
  }

  const itemTotals = Array.from(totalsByItem.values()).sort(
    (a, b) => b.totalCents - a.totalCents || a.itemName.localeCompare(b.itemName),
  );

  const totalCents = itemTotals.reduce((sum, entry) => sum + entry.totalCents, 0);
  const totalItemCount = itemTotals.reduce((sum, entry) => sum + entry.quantity, 0);

  return (
    <div className="space-y-6">
      <header className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Period overview</h1>
        <p className="mt-2 text-sm text-slate-600">
          Summary of all unsettled consumptions (resets once a settlement bills them).
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Totals (unsettled)</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Total expected revenue</div>
            <div className="text-lg font-semibold text-slate-900">
              {formatCurrency(totalCents, env.APP_CURRENCY, { locale: env.APP_LOCALE })}
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Total items</div>
            <div className="text-lg font-semibold text-slate-900">{totalItemCount}</div>
          </div>
          <div className="rounded-lg bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Members with activity</div>
            <div className="text-lg font-semibold text-slate-900">{lines.length}</div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">By item</h2>
        <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {itemTotals.map((entry) => (
                <tr key={entry.itemId}>
                  <td className="px-4 py-3 font-medium text-slate-900">{entry.itemName}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{entry.quantity}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    {formatCurrency(entry.totalCents, env.APP_CURRENCY, { locale: env.APP_LOCALE })}
                  </td>
                </tr>
              ))}
              {!itemTotals.length && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-sm text-slate-500">
                    No unsettled activity.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">By member</h2>
        <p className="mt-1 text-sm text-slate-600">Click a row to expand the item breakdown.</p>

        <div className="mt-4 space-y-3">
          {lines.map((line) => (
            <details key={line.userId} className="rounded-xl border border-slate-200 p-4">
              <summary className="cursor-pointer">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm font-semibold text-slate-900">{line.userName || line.userEmail}</div>
                  <div className="text-sm font-semibold text-slate-900">
                    {formatCurrency(line.totalCents, env.APP_CURRENCY, { locale: env.APP_LOCALE })}
                  </div>
                </div>
                <div className="mt-1 text-xs text-slate-500">{line.itemCount} items · {line.userEmail}</div>
              </summary>
              <div className="mt-4 space-y-2">
                {line.breakdown.map((item) => (
                  <div key={`${item.itemId}:${item.unitPriceCents}`} className="flex items-center justify-between text-sm">
                    <div className="text-slate-700">
                      {item.itemName} × {item.quantity}
                    </div>
                    <div className="font-semibold text-slate-900">
                      {formatCurrency(item.totalCents, env.APP_CURRENCY, { locale: env.APP_LOCALE })}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          ))}

          {!lines.length && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
              No unsettled activity.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

