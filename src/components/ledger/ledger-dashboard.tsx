"use client";

import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { Sparkline } from "@/components/analytics/sparkline";
import { formatCurrency } from "@/lib/currency";

type LedgerSummaryResponse = {
  window: "7d" | "30d" | "90d";
  startDate: string;
  endDate: string;
  currentBalanceCents: number;
  startingBalanceCents: number;
  series: { labels: string[]; values: number[] };
};

type Message = { type: "success" | "error"; text: string } | null;

const CATEGORY_OPTIONS = [
  "RECEIPT",
  "SETTLEMENT",
  "PURCHASE",
  "WRITE_OFF",
  "ADJUSTMENT",
  "OTHER",
] as const;

type LedgerCategory = (typeof CATEGORY_OPTIONS)[number];

export function LedgerDashboard({ locale, currency }: { locale: string; currency: string }) {
  const [windowKey, setWindowKey] = useState<LedgerSummaryResponse["window"]>("30d");
  const [summary, setSummary] = useState<LedgerSummaryResponse | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [loading, setLoading] = useState(false);

  const [direction, setDirection] = useState<"credit" | "debit">("credit");
  const [amountCents, setAmountCents] = useState<number>(0);
  const [category, setCategory] = useState<LedgerCategory>("ADJUSTMENT");
  const [description, setDescription] = useState<string>("");

  async function loadSummary(activeWindow: LedgerSummaryResponse["window"]) {
    setLoading(true);
    try {
      const response = await fetch(`/api/ledger/summary?window=${activeWindow}`);
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error?.message ?? "Unable to load ledger summary");
      }
      const payload = (await response.json()) as LedgerSummaryResponse;
      setSummary(payload);
    } catch (err: unknown) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Unable to load ledger summary" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSummary(windowKey);
  }, [windowKey]);

  const createEntryMutation = useMutation({
    mutationFn: async () => {
      const normalizedDescription = description.trim();
      const normalizedAmount = Math.abs(Number(amountCents));
      const signedAmount = direction === "debit" ? -1 * normalizedAmount : normalizedAmount;

      const response = await fetch("/api/ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: normalizedDescription,
          amountCents: signedAmount,
          category,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error?.message ?? "Unable to create ledger entry");
      }

      return response.json() as Promise<{ entry: { id: string } }>;
    },
    onSuccess: async () => {
      setMessage({ type: "success", text: "Ledger entry created." });
      setDescription("");
      setAmountCents(0);
      await loadSummary(windowKey);
    },
    onError: (err: unknown) => {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Unable to create ledger entry" });
    },
  });

  const currentBalance = summary?.currentBalanceCents ?? 0;

  const balanceTone = useMemo(() => {
    if (currentBalance > 0) return "text-emerald-700";
    if (currentBalance < 0) return "text-red-700";
    return "text-slate-700";
  }, [currentBalance]);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Account balance</h2>
            <p className="mt-1 text-sm text-slate-600">Balance changes from ledger entries.</p>
          </div>

          <div className="flex items-center gap-2 text-sm">
            {(["7d", "30d", "90d"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setWindowKey(key)}
                className={`rounded-lg border px-3 py-2 font-semibold ${
                  windowKey === key
                    ? "border-brand bg-brand/5 text-brand"
                    : "border-slate-200 text-slate-700 hover:border-brand hover:text-brand"
                }`}
              >
                {key.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Current balance</div>
            <div className={`text-2xl font-bold ${balanceTone}`}>
              {formatCurrency(currentBalance, currency, { locale })}
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Sparkline
              values={summary?.series.values ?? []}
              className="text-brand"
              ariaLabel="Ledger balance trend"
            />
            {loading ? "Loading..." : summary ? `${summary.window.toUpperCase()} trend` : "—"}
          </div>
        </div>

        {message && (
          <div
            className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
              message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {message.text}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Adjust balance</h2>
        <p className="mt-1 text-sm text-slate-600">
          Record opening balances, donations, or manual corrections. Keep descriptions short and specific.
        </p>

        <form
          className="mt-4 grid gap-4 md:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            setMessage(null);
            createEntryMutation.mutate();
          }}
        >
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
            Type
            <select
              value={direction}
              onChange={(event) => setDirection(event.target.value as "credit" | "debit")}
              className="rounded border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none"
            >
              <option value="credit">Credit (money in)</option>
              <option value="debit">Debit (money out)</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
            Amount (minor units)
            <input
              type="number"
              min={0}
              step={1}
              value={amountCents}
              onChange={(event) => setAmountCents(Number(event.target.value))}
              className="rounded border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none"
              required
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
            Category
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as LedgerCategory)}
              className="rounded border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none"
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>

          <label className="md:col-span-4 flex flex-col gap-1 text-sm font-medium text-slate-600">
            Description (max 200 chars, Unicode ok)
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={200}
              className="rounded border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none"
              placeholder="Opening float / donation / correction / ..."
              required
            />
          </label>

          <div className="md:col-span-4">
            <button
              type="submit"
              disabled={createEntryMutation.isPending}
              className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {createEntryMutation.isPending ? "Saving..." : "Create entry"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
