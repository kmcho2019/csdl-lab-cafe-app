import { Role } from "@prisma/client";
import { redirect } from "next/navigation";

import { LedgerDashboard } from "@/components/ledger/ledger-dashboard";
import { formatCurrency } from "@/lib/currency";
import { env } from "@/lib/env";
import { getAuthSession } from "@/server/auth/session";
import { prisma } from "@/server/db/client";

export default async function LedgerPage() {
  const session = await getAuthSession();
  if (!session?.user) {
    redirect("/api/auth/signin");
  }

  if (session.user.role !== Role.ADMIN) {
    redirect("/app");
  }

  const entries = await prisma.ledgerEntry.findMany({
    orderBy: { timestamp: "desc" },
    take: 50,
    include: {
      user: true,
      settlement: { select: { number: true } },
      purchaseOrder: { select: { vendorName: true } },
    },
  });

  return (
    <div className="space-y-6">
      <header className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Ledger</h1>
        <p className="mt-2 text-sm text-slate-600">Last 50 entries</p>
      </header>

      <LedgerDashboard locale={env.APP_LOCALE} currency={env.APP_CURRENCY} />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Timestamp</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td className="px-4 py-3 align-top text-xs text-slate-500">
                  {entry.timestamp.toISOString().slice(0, 16).replace("T", " ")}
                </td>
                <td className="px-4 py-3 align-top">
                  <div className="font-medium text-slate-900">{entry.description}</div>
                  <div className="text-xs text-slate-500">
                    {entry.user?.name ?? entry.user?.email ?? ""}
                    {entry.settlement ? ` · Settlement #${entry.settlement.number}` : ""}
                    {entry.purchaseOrder ? ` · ${entry.purchaseOrder.vendorName}` : ""}
                  </div>
                </td>
                <td
                  className={`px-4 py-3 align-top text-right font-semibold ${
                    entry.amountCents >= 0 ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {formatCurrency(entry.amountCents, env.APP_CURRENCY, { locale: env.APP_LOCALE })}
                </td>
                <td className="px-4 py-3 align-top text-sm text-slate-500">
                  {entry.balanceAfterCents != null
                    ? formatCurrency(entry.balanceAfterCents, env.APP_CURRENCY, { locale: env.APP_LOCALE })
                    : "—"}
                </td>
              </tr>
            ))}
            {!entries.length && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">
                  No ledger entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
