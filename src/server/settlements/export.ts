import { format } from "date-fns";

import { formatCurrency } from "@/lib/currency";
import { toCsv } from "@/lib/csv";

import type { SettlementPreviewLine } from "./compute";

type SettlementCsvParams = {
  settlementNumber: number;
  startDate: Date;
  endDate: Date;
  currency: string;
  generatedAt: Date;
  lines: SettlementPreviewLine[];
  memoPrefix?: string;
};

function formatIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function buildSettlementAccountingCsv(params: SettlementCsvParams) {
  const { settlementNumber, startDate, endDate, currency, generatedAt, lines } = params;
  const startLabel = format(startDate, "yyyy-MM");
  const endLabel = format(endDate, "yyyy-MM");
  const memoPrefix = params.memoPrefix ?? "Cafe";
  const memo = startLabel === endLabel ? `${memoPrefix} ${startLabel}` : `${memoPrefix} ${startLabel} — ${endLabel}`;

  const rows = [
    [
      "settlementNumber",
      "startDate",
      "endDate",
      "generatedAt",
      "userName",
      "userEmail",
      "itemCount",
      "totalCents",
      "currency",
      "totalFormatted",
      "memo",
      "breakdown",
    ],
    ...lines.map((line) => {
      const breakdown = line.breakdown
        .map((item) => `${item.itemName} x${item.quantity}`)
        .join("; ");

      return [
        settlementNumber,
        formatIsoDate(startDate),
        formatIsoDate(endDate),
        generatedAt.toISOString(),
        line.userName || line.userEmail,
        line.userEmail,
        line.itemCount,
        line.totalCents,
        currency,
        formatCurrency(line.totalCents, currency),
        memo,
        breakdown,
      ];
    }),
  ];

  return toCsv(rows);
}

