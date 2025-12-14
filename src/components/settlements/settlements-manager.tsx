"use client";

import { useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import Link from "next/link";
import { useMemo, useState } from "react";

type SettlementStatus = "DRAFT" | "FINALIZED" | "VOID";

type SettlementSummary = {
  id: string;
  number: number;
  startDate: string;
  endDate: string;
  status: SettlementStatus;
  notes: string;
  createdAt: string;
  finalizedAt: string | null;
  counts: {
    consumptions: number;
    lines: number;
    payments: number;
  };
};

type Message = { type: "success" | "error"; text: string } | null;

function statusBadge(status: SettlementStatus) {
  switch (status) {
    case "FINALIZED":
      return "bg-emerald-50 text-emerald-700";
    case "VOID":
      return "bg-slate-100 text-slate-500";
    default:
      return "bg-amber-50 text-amber-700";
  }
}

function formatRange(startIso: string, endIso: string) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
}

export function SettlementsManager({ initialSettlements }: { initialSettlements: SettlementSummary[] }) {
  const [settlements, setSettlements] = useState(() => initialSettlements);
  const [message, setMessage] = useState<Message>(null);

  const sorted = useMemo(() => {
    return [...settlements].sort((a, b) => b.startDate.localeCompare(a.startDate));
  }, [settlements]);

  const createMutation = useMutation({
    mutationFn: async ({ month, notes }: { month: string; notes?: string }) => {
      const response = await fetch("/api/settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, notes }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error?.message ?? "Unable to create settlement");
      }

      return response.json() as Promise<{ settlement: SettlementSummary }>;
    },
    onSuccess: (payload) => {
      setSettlements((prev) => [payload.settlement, ...prev]);
      setMessage({ type: "success", text: `Created settlement #${payload.settlement.number}.` });
    },
    onError: (error: unknown) => {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Settlement creation failed." });
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const response = await fetch(`/api/settlements/${id}/finalize`, { method: "POST" });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error?.message ?? "Unable to finalize settlement");
      }

      return response.json() as Promise<{ settlement: SettlementSummary }>;
    },
    onSuccess: (payload) => {
      setSettlements((prev) => prev.map((settlement) => (settlement.id === payload.settlement.id ? payload.settlement : settlement)));
      setMessage({ type: "success", text: `Finalized settlement #${payload.settlement.number}.` });
    },
    onError: (error: unknown) => {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Settlement finalization failed." });
    },
  });

  const pending = createMutation.isPending || finalizeMutation.isPending;

  return (
    <div className="space-y-6">
      <header className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Settlements</h1>
        <p className="mt-2 text-sm text-slate-600">
          Create a monthly draft, preview via CSV, then finalize to lock consumptions.
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Create monthly settlement</h2>
        <p className="mt-1 text-sm text-slate-600">Pick a month to bill. You can export a preview CSV before finalizing.</p>

        <form
          className="mt-4 grid gap-4 md:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const month = formData.get("month")?.toString() ?? "";
            const notes = formData.get("notes")?.toString().trim() ?? "";

            setMessage(null);
            createMutation.mutate({ month, notes: notes || undefined });
          }}
        >
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
            Month
            <input
              name="month"
              type="month"
              required
              className="rounded border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none"
              defaultValue={format(new Date(), "yyyy-MM")}
            />
          </label>

          <label className="md:col-span-2 flex flex-col gap-1 text-sm font-medium text-slate-600">
            Notes (optional)
            <input
              name="notes"
              type="text"
              placeholder="E.g. end-of-semester closeout"
              className="rounded border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none"
            />
          </label>

          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {createMutation.isPending ? "Creating..." : "Create draft"}
            </button>
          </div>
        </form>
      </section>

      {message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}
        >
          {message.text}
        </div>
      )}

      <div className="space-y-4">
        {sorted.map((settlement) => {
          const exportHref = `/api/settlements/${settlement.id}/export?format=csv`;
          const isDraft = settlement.status === "DRAFT";
          return (
            <article key={settlement.id} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-slate-900">
                      Settlement #{settlement.number}
                    </h2>
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusBadge(settlement.status)}`}>
                      {settlement.status}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600">{formatRange(settlement.startDate, settlement.endDate)}</p>
                  {settlement.notes && <p className="text-xs text-slate-500">{settlement.notes}</p>}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={exportHref}
                    prefetch={false}
                    className="rounded border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-brand hover:text-brand"
                  >
                    {isDraft ? "Download preview CSV" : "Download CSV"}
                  </Link>
                  {isDraft && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        setMessage(null);
                        finalizeMutation.mutate({ id: settlement.id });
                      }}
                      className="rounded bg-brand px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {finalizeMutation.isPending ? "Finalizing..." : "Finalize"}
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Members</div>
                  <div className="text-sm font-semibold text-slate-900">{settlement.counts.lines}</div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Consumptions</div>
                  <div className="text-sm font-semibold text-slate-900">{settlement.counts.consumptions}</div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Payments</div>
                  <div className="text-sm font-semibold text-slate-900">{settlement.counts.payments}</div>
                </div>
              </div>
            </article>
          );
        })}
        {!sorted.length && (
          <div className="rounded-xl border border-dashed border-brand/50 bg-brand/5 p-6 text-sm text-slate-600">
            No settlements yet. Create a draft month to start billing.
          </div>
        )}
      </div>
    </div>
  );
}

