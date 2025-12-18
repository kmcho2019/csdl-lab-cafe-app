import { Role } from "@prisma/client";
import { notFound, redirect } from "next/navigation";

import { formatCurrency } from "@/lib/currency";
import { env } from "@/lib/env";
import { getAuthSession } from "@/server/auth/session";
import { prisma } from "@/server/db/client";

type BreakdownItem = {
  itemId: string;
  itemName: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
};

function parseBreakdownJson(value: unknown): BreakdownItem[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  const items = (value as { items?: unknown }).items;
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const candidate = item as Partial<BreakdownItem>;
      if (
        typeof candidate.itemId !== "string" ||
        typeof candidate.itemName !== "string" ||
        typeof candidate.quantity !== "number" ||
        typeof candidate.unitPriceCents !== "number" ||
        typeof candidate.totalCents !== "number"
      ) {
        return null;
      }

      return {
        itemId: candidate.itemId,
        itemName: candidate.itemName,
        quantity: candidate.quantity,
        unitPriceCents: candidate.unitPriceCents,
        totalCents: candidate.totalCents,
      } satisfies BreakdownItem;
    })
    .filter((entry): entry is BreakdownItem => Boolean(entry));
}

export default async function UserReportPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthSession();
  if (!session?.user) {
    redirect("/api/auth/signin");
  }

  if (session.user.role !== Role.ADMIN) {
    redirect("/app");
  }

  const { id } = await params;
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, isActive: true, role: true },
  });

  if (!target) {
    notFound();
  }

  const [openConsumptions, settlementLines] = await Promise.all([
    prisma.consumption.findMany({
      where: {
        userId: target.id,
        settlementId: null,
        reversedAt: null,
      },
      include: { item: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.settlementLine.findMany({
      where: { userId: target.id },
      include: {
        settlement: { select: { number: true, startDate: true, endDate: true, status: true, finalizedAt: true } },
      },
      orderBy: { settlement: { startDate: "desc" } },
      take: 12,
    }),
  ]);

  const openItemCount = openConsumptions.reduce((sum, entry) => sum + entry.quantity, 0);
  const openTransactionCount = openConsumptions.length;
  const openTotalCents = openConsumptions.reduce((sum, entry) => sum + entry.priceAtTxCents * entry.quantity, 0);

  const openBreakdown = new Map<string, { itemId: string; itemName: string; quantity: number; unitPriceCents: number; totalCents: number }>();
  for (const entry of openConsumptions) {
    const key = `${entry.itemId}:${entry.priceAtTxCents}`;
    const existing = openBreakdown.get(key);
    if (existing) {
      existing.quantity += entry.quantity;
      existing.totalCents += entry.priceAtTxCents * entry.quantity;
    } else {
      openBreakdown.set(key, {
        itemId: entry.itemId,
        itemName: entry.item.name,
        quantity: entry.quantity,
        unitPriceCents: entry.priceAtTxCents,
        totalCents: entry.priceAtTxCents * entry.quantity,
      });
    }
  }

  const openBreakdownRows = Array.from(openBreakdown.values()).sort((a, b) => b.totalCents - a.totalCents || a.itemName.localeCompare(b.itemName));

  return (
    <div className="space-y-6">
      <header className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Member report</h1>
        <p className="mt-2 text-sm text-slate-600">
          {target.name ?? target.email} · {target.email} · {target.role} · {target.isActive ? "Active" : "Frozen"}
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Current period (unsettled)</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Expected bill</div>
            <div className="text-lg font-semibold text-slate-900">
              {formatCurrency(openTotalCents, env.APP_CURRENCY, { locale: env.APP_LOCALE })}
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Transactions</div>
            <div className="text-lg font-semibold text-slate-900">{openTransactionCount}</div>
          </div>
          <div className="rounded-lg bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Items</div>
            <div className="text-lg font-semibold text-slate-900">{openItemCount}</div>
          </div>
        </div>

        <details className="mt-6 rounded-lg border border-slate-200 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">
            Breakdown by item ({openBreakdownRows.length})
          </summary>
          <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3 text-right">Unit</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {openBreakdownRows.map((row) => (
                  <tr key={`${row.itemId}:${row.unitPriceCents}`}>
                    <td className="px-4 py-3 font-medium text-slate-900">{row.itemName}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{row.quantity}</td>
                    <td className="px-4 py-3 text-right text-slate-700">
                      {formatCurrency(row.unitPriceCents, env.APP_CURRENCY, { locale: env.APP_LOCALE })}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      {formatCurrency(row.totalCents, env.APP_CURRENCY, { locale: env.APP_LOCALE })}
                    </td>
                  </tr>
                ))}
                {!openBreakdownRows.length && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">
                      No open transactions.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Past settlements</h2>
        <p className="mt-1 text-sm text-slate-600">Last 12 billed periods for this member.</p>

        <div className="mt-4 space-y-3">
          {settlementLines.map((line) => {
            const breakdown = parseBreakdownJson(line.breakdownJson);
            return (
              <details key={line.id} className="rounded-xl border border-slate-200 p-4">
                <summary className="cursor-pointer">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm font-semibold text-slate-900">
                      Settlement #{line.settlement.number}
                    </div>
                    <div className="text-sm font-semibold text-slate-900">
                      {formatCurrency(line.totalCents, env.APP_CURRENCY, { locale: env.APP_LOCALE })}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {line.settlement.startDate.toISOString().slice(0, 10)} – {line.settlement.endDate.toISOString().slice(0, 10)} · {line.itemCount} items · {line.settlement.status}
                  </div>
                </summary>
                <div className="mt-4 space-y-2">
                  {breakdown.map((item) => (
                    <div key={`${item.itemId}:${item.unitPriceCents}`} className="flex items-center justify-between text-sm">
                      <div className="text-slate-700">
                        {item.itemName} × {item.quantity}
                      </div>
                      <div className="font-semibold text-slate-900">
                        {formatCurrency(item.totalCents, env.APP_CURRENCY, { locale: env.APP_LOCALE })}
                      </div>
                    </div>
                  ))}
                  {!breakdown.length && (
                    <div className="text-sm text-slate-500">No breakdown available.</div>
                  )}
                </div>
              </details>
            );
          })}

          {!settlementLines.length && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
              No settlements yet.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

