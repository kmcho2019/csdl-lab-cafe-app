import { Role } from "@prisma/client";
import { format } from "date-fns";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Sparkline } from "@/components/analytics/sparkline";
import { getAuthSession } from "@/server/auth/session";
import { prisma } from "@/server/db/client";
import { buildDailyStockSeries, type StockMovementForSeries } from "@/server/reports/stock-series";

type WindowKey = "7d" | "30d" | "90d";

function getWindowDays(windowKey: string | undefined): { key: WindowKey; days: number } {
  if (windowKey === "7d") return { key: "7d", days: 7 };
  if (windowKey === "90d") return { key: "90d", days: 90 };
  return { key: "30d", days: 30 };
}

function utcRangeForDays(days: number) {
  const now = new Date();
  const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  startDate.setUTCDate(startDate.getUTCDate() - (days - 1));
  return { startDate, endDate };
}

type StockLevel = "OUT" | "LOW" | "OK";

function stockStatus(currentStock: number, threshold: number): StockLevel {
  if (currentStock <= 0) return "OUT";
  if (currentStock <= threshold) return "LOW";
  return "OK";
}

function stockBadge(status: StockLevel) {
  switch (status) {
    case "OUT":
      return "bg-red-50 text-red-700";
    case "LOW":
      return "bg-amber-50 text-amber-700";
    default:
      return "bg-emerald-50 text-emerald-700";
  }
}

function trendColor(status: StockLevel) {
  switch (status) {
    case "OUT":
      return "text-red-500";
    case "LOW":
      return "text-amber-500";
    default:
      return "text-emerald-500";
  }
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams?: Promise<{ window?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const session = await getAuthSession();
  if (!session?.user) {
    redirect("/api/auth/signin");
  }

  if (session.user.role !== Role.ADMIN) {
    redirect("/app");
  }

  const windowConfig = getWindowDays(resolvedSearchParams?.window);
  const { startDate, endDate } = utcRangeForDays(windowConfig.days);

  const items = await prisma.item.findMany({
    where: { isActive: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      category: true,
      unit: true,
      currentStock: true,
      lowStockThreshold: true,
    },
  });

  const itemIds = items.map((item) => item.id);

  const [popularityGroups, movements] = await Promise.all([
    prisma.consumption.groupBy({
      by: ["itemId"],
      where: {
        reversedAt: null,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      _sum: { quantity: true },
    }),
    prisma.stockMovement.findMany({
      where: {
        itemId: { in: itemIds },
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        itemId: true,
        type: true,
        quantity: true,
        createdAt: true,
      },
    }),
  ]);

  const popularity = popularityGroups
    .map((group) => {
      const item = items.find((candidate) => candidate.id === group.itemId);
      if (!item) {
        return null;
      }
      return {
        itemId: group.itemId,
        name: item.name,
        category: item.category ?? "Uncategorized",
        quantity: group._sum.quantity ?? 0,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name))
    .slice(0, 10);

  const maxPopularity = popularity[0]?.quantity ?? 0;

  const movementsByItem = movements.reduce<Record<string, StockMovementForSeries[]>>((acc, move) => {
    acc[move.itemId] = acc[move.itemId] ?? [];
    acc[move.itemId].push({
      type: move.type,
      quantity: move.quantity,
      createdAt: move.createdAt,
    });
    return acc;
  }, {});

  const stockCards = items
    .map((item) => {
      const status = stockStatus(item.currentStock, item.lowStockThreshold);
      const series = buildDailyStockSeries({
        currentStock: item.currentStock,
        startDate,
        endDate,
        movements: movementsByItem[item.id] ?? [],
      });

      return {
        id: item.id,
        name: item.name,
        category: item.category ?? "Uncategorized",
        unit: item.unit ?? "units",
        currentStock: item.currentStock,
        lowStockThreshold: item.lowStockThreshold,
        status,
        series,
      };
    })
    .sort((a, b) => {
      const severity = (status: StockLevel) => (status === "OUT" ? 0 : status === "LOW" ? 1 : 2);
      const severityCompare = severity(a.status) - severity(b.status);
      if (severityCompare !== 0) {
        return severityCompare;
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

  const windowLabel = `${format(startDate, "MMM d")} – ${format(endDate, "MMM d, yyyy")}`;

  return (
    <div className="space-y-6">
      <header className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Analytics</h1>
            <p className="mt-2 text-sm text-slate-600">Popularity and stock trends for {windowLabel}.</p>
          </div>
          <nav className="flex items-center gap-2 text-sm">
            {(["7d", "30d", "90d"] as const).map((key) => (
              <Link
                key={key}
                href={`/app/analytics?window=${key}`}
                className={`rounded-lg border px-3 py-2 font-semibold ${
                  windowConfig.key === key
                    ? "border-brand bg-brand/5 text-brand"
                    : "border-slate-200 text-slate-700 hover:border-brand hover:text-brand"
                }`}
              >
                {key.toUpperCase()}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-1">
          <h2 className="text-lg font-semibold text-slate-900">Most popular</h2>
          <p className="mt-1 text-sm text-slate-600">Top items by units consumed.</p>

          <div className="mt-4 space-y-3">
            {popularity.map((entry) => {
              const pct = maxPopularity > 0 ? Math.round((entry.quantity / maxPopularity) * 100) : 0;
              return (
                <div key={entry.itemId} className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-slate-900">{entry.name}</div>
                      <div className="text-xs text-slate-500">{entry.category}</div>
                    </div>
                    <div className="shrink-0 text-sm font-semibold text-slate-700">{entry.quantity}</div>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}

            {!popularity.length && (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                No consumption data in this window yet.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <h2 className="text-lg font-semibold text-slate-900">Stock trends</h2>
          <p className="mt-1 text-sm text-slate-600">
            Sparkline shows stock after daily movements. Badges highlight low stock thresholds.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {stockCards.map((item) => {
              return (
                <article key={item.id} className="rounded-xl border border-slate-200 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-semibold text-slate-900">{item.name}</h3>
                      <p className="text-xs text-slate-500">{item.category}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${stockBadge(item.status)}`}>
                      {item.status === "OK" ? "OK" : item.status === "LOW" ? "Low" : "Out"}
                    </span>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-2xl font-semibold text-slate-900">{item.currentStock}</div>
                      <div className="text-xs text-slate-500">
                        {item.unit} remaining · Low at {item.lowStockThreshold}
                      </div>
                    </div>
                    <Sparkline values={item.series.values} className={`h-10 w-32 ${trendColor(item.status)}`} />
                  </div>
                </article>
              );
            })}

            {!stockCards.length && (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                No active items yet.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
