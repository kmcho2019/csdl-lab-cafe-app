import { Role, SettlementStatus } from "@prisma/client";
import { differenceInDays, format } from "date-fns";
import { redirect } from "next/navigation";

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
    take: 10,
    include: {
      _count: {
        select: { consumptions: true, lines: true },
      },
    },
  });

  return (
    <div className="space-y-6">
      <header className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Settlements</h1>
        <p className="mt-2 text-sm text-slate-600">
          Draft, finalize, and export settlements. (Queue implementation coming soon.)
        </p>
      </header>
      <div className="space-y-4">
        {settlements.map((settlement) => (
          <article key={settlement.id} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Period {format(settlement.startDate, "MMM d")} – {format(settlement.endDate, "MMM d, yyyy")}
                </h2>
                <p className="text-xs uppercase tracking-wide text-slate-500">{settlement.status}</p>
              </div>
              <div className="text-sm text-slate-500">
                {settlement._count.lines} members · {settlement._count.consumptions} consumptions
              </div>
            </div>
            <div className="mt-3 text-xs text-slate-500">
              Created {differenceInDays(new Date(), settlement.createdAt)} days ago.
            </div>
          </article>
        ))}
        {!settlements.length && (
          <div className="rounded-xl border border-dashed border-brand/50 bg-brand/5 p-6 text-sm text-slate-600">
            No settlements yet. Create the first draft to start closing tabs.
          </div>
        )}
      </div>
    </div>
  );
}
