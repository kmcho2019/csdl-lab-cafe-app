"use client";

import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { formatCurrency } from "@/lib/currency";

type ItemOption = {
  id: string;
  name: string;
  category: string | null;
  priceCents: number;
  currency: string;
  currentStock: number;
};

type PurchaseOrderLine = {
  id: string;
  itemId: string;
  itemName: string;
  quantity: number;
  unitCostCents: number;
};

type PurchaseOrderSummary = {
  id: string;
  vendorName: string;
  purchaseChannel: string;
  receiptPath: string;
  comment: string;
  miscCostCents: number;
  miscComment: string;
  status: string;
  createdAt: string;
  totalCostCents: number;
  createdBy: { id: string; name: string | null; email: string } | null;
  items: PurchaseOrderLine[];
};

type Message = { type: "success" | "error"; text: string } | null;

type DraftLine = {
  itemId: string;
  quantity: number;
  unitCostCents: number;
};

export function RestockManager({
  currency,
  locale,
  items,
  initialPurchaseOrders,
}: {
  currency: string;
  locale: string;
  items: ItemOption[];
  initialPurchaseOrders: PurchaseOrderSummary[];
}) {
  const [purchaseOrders, setPurchaseOrders] = useState(() => initialPurchaseOrders);
  const [message, setMessage] = useState<Message>(null);

  const [vendorName, setVendorName] = useState("");
  const [purchaseChannel, setPurchaseChannel] = useState("");
  const [receiptPath, setReceiptPath] = useState("");
  const [comment, setComment] = useState("");
  const [miscCostCents, setMiscCostCents] = useState(0);
  const [miscComment, setMiscComment] = useState("");

  const [lines, setLines] = useState<DraftLine[]>(() => [
    { itemId: items[0]?.id ?? "", quantity: 1, unitCostCents: 0 },
  ]);

  const categories = useMemo(() => {
    return items.reduce<Record<string, ItemOption[]>>((acc, item) => {
      const key = item.category ?? "Uncategorized";
      acc[key] = acc[key] ?? [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [items]);

  const totals = useMemo(() => {
    const costLinesCents = lines.reduce((sum, line) => sum + line.quantity * line.unitCostCents, 0);
    const revenueLinesCents = lines.reduce((sum, line) => {
      const item = items.find((candidate) => candidate.id === line.itemId);
      return sum + (item ? item.priceCents * line.quantity : 0);
    }, 0);
    const totalCostCents = costLinesCents + (miscCostCents || 0);
    const marginCents = revenueLinesCents - totalCostCents;
    return { costLinesCents, revenueLinesCents, totalCostCents, marginCents };
  }, [lines, miscCostCents, items]);

  const createPurchaseOrder = useMutation({
    mutationFn: async (payload: {
      vendorName: string;
      purchaseChannel?: string;
      receiptPath?: string;
      comment?: string;
      miscCostCents?: number;
      miscComment?: string;
      lines: Array<{ itemId: string; quantity: number; unitCostCents: number }>;
    }) => {
      const response = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error?.message ?? "Unable to create restock");
      }

      return response.json() as Promise<{ purchaseOrder: PurchaseOrderSummary }>;
    },
    onSuccess: (payload) => {
      setPurchaseOrders((prev) => [payload.purchaseOrder, ...prev]);
      setMessage({ type: "success", text: "Restock recorded and ledger debited." });
      setVendorName("");
      setPurchaseChannel("");
      setReceiptPath("");
      setComment("");
      setMiscCostCents(0);
      setMiscComment("");
      setLines([{ itemId: items[0]?.id ?? "", quantity: 1, unitCostCents: 0 }]);
    },
    onError: (error: unknown) => {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Unable to create restock" });
    },
  });

  return (
    <div className="space-y-6">
      <header className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Restocks</h1>
        <p className="mt-2 text-sm text-slate-600">
          Record a multi-item restock in one place (stock movements + ledger outflow).
        </p>
      </header>

      {message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">New restock</h2>
        <p className="mt-1 text-sm text-slate-600">
          Enter wholesale costs carefully — the UI warns when unit cost is close to or above the selling price.
        </p>

        <form
          className="mt-6 space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            setMessage(null);

            const trimmedVendor = vendorName.trim();
            if (!trimmedVendor) {
              setMessage({ type: "error", text: "Vendor is required." });
              return;
            }

            const cleanedLines = lines
              .map((line) => ({
                itemId: line.itemId,
                quantity: Number(line.quantity),
                unitCostCents: Number(line.unitCostCents),
              }))
              .filter((line) => line.itemId);

            if (!cleanedLines.length) {
              setMessage({ type: "error", text: "Add at least one item line." });
              return;
            }

            const ids = new Set<string>();
            for (const line of cleanedLines) {
              if (ids.has(line.itemId)) {
                setMessage({ type: "error", text: "Each item can only appear once. Combine quantities instead." });
                return;
              }
              ids.add(line.itemId);
              if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
                setMessage({ type: "error", text: "Quantities must be positive integers." });
                return;
              }
              if (!Number.isFinite(line.unitCostCents) || line.unitCostCents < 0) {
                setMessage({ type: "error", text: "Unit cost must be zero or positive." });
                return;
              }
            }

            createPurchaseOrder.mutate({
              vendorName: trimmedVendor,
              purchaseChannel: purchaseChannel.trim() || undefined,
              receiptPath: receiptPath.trim() || undefined,
              comment: comment.trim() || undefined,
              miscCostCents: miscCostCents || 0,
              miscComment: miscComment.trim() || undefined,
              lines: cleanedLines,
            });
          }}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
              Vendor / store
              <input
                value={vendorName}
                onChange={(event) => setVendorName(event.target.value)}
                maxLength={120}
                required
                className="rounded border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none"
                placeholder="Coupang / Amazon / Costco / ..."
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
              Channel (optional)
              <input
                value={purchaseChannel}
                onChange={(event) => setPurchaseChannel(event.target.value)}
                maxLength={80}
                className="rounded border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none"
                placeholder="online / offline / ..."
              />
            </label>
            <label className="md:col-span-2 flex flex-col gap-1 text-sm font-medium text-slate-600">
              Receipt path (optional)
              <input
                value={receiptPath}
                onChange={(event) => setReceiptPath(event.target.value)}
                maxLength={500}
                className="rounded border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none"
                placeholder="s3://bucket/path/to/receipt.pdf"
              />
            </label>
            <label className="md:col-span-2 flex flex-col gap-1 text-sm font-medium text-slate-600">
              Comment (optional, max 200 chars)
              <input
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                maxLength={200}
                className="rounded border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none"
                placeholder="Details: coupon, pickup, etc."
              />
            </label>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">Items</h3>
              <button
                type="button"
                onClick={() => setLines((prev) => [...prev, { itemId: items[0]?.id ?? "", quantity: 1, unitCostCents: 0 }])}
                className="rounded border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-brand hover:text-brand"
              >
                Add line
              </button>
            </div>

            {lines.map((line, index) => {
              const item = items.find((candidate) => candidate.id === line.itemId);
              const selling = item?.priceCents ?? 0;
              const unitCost = line.unitCostCents ?? 0;
              const marginCents = selling - unitCost;
              const warning =
                unitCost > 0 && selling > 0 && unitCost >= selling
                  ? "Unit cost is at/above the selling price (loss)."
                  : unitCost > 0 && selling > 0 && unitCost >= Math.floor(selling * 0.9)
                    ? "Unit cost is close to the selling price (low margin)."
                    : null;

              return (
                <div key={index} className="rounded-lg border border-slate-200 p-4">
                  <div className="grid gap-4 md:grid-cols-4">
                    <label className="md:col-span-2 flex flex-col gap-1 text-sm font-medium text-slate-600">
                      Item
                      <select
                        value={line.itemId}
                        onChange={(event) =>
                          setLines((prev) =>
                            prev.map((candidate, idx) =>
                              idx === index ? { ...candidate, itemId: event.target.value } : candidate,
                            ),
                          )
                        }
                        className="rounded border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none"
                      >
                        {Object.entries(categories).map(([category, categoryItems]) => (
                          <optgroup key={category} label={category}>
                            {categoryItems.map((candidate) => (
                              <option key={candidate.id} value={candidate.id}>
                                {candidate.name}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
                      Quantity
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={line.quantity}
                        onChange={(event) =>
                          setLines((prev) =>
                            prev.map((candidate, idx) =>
                              idx === index ? { ...candidate, quantity: Number(event.target.value) } : candidate,
                            ),
                          )
                        }
                        className="rounded border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none"
                        required
                      />
                    </label>

                    <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
                      Unit cost (minor units)
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={line.unitCostCents}
                        onChange={(event) =>
                          setLines((prev) =>
                            prev.map((candidate, idx) =>
                              idx === index ? { ...candidate, unitCostCents: Number(event.target.value) } : candidate,
                            ),
                          )
                        }
                        className="rounded border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none"
                      />
                    </label>
                  </div>

                  <div className="mt-3 flex flex-col gap-2 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      Selling price:{" "}
                      <span className="font-semibold text-slate-900">
                        {item ? formatCurrency(item.priceCents, currency, { locale }) : "—"}
                      </span>
                      {unitCost > 0 && item && (
                        <>
                          {" "}
                          · Margin:{" "}
                          <span className={`font-semibold ${marginCents < 0 ? "text-red-600" : "text-emerald-700"}`}>
                            {formatCurrency(marginCents, currency, { locale })}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span>
                        Line total:{" "}
                        <span className="font-semibold text-slate-900">
                          {formatCurrency(line.quantity * line.unitCostCents, currency, { locale })}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== index))}
                        disabled={lines.length <= 1}
                        className="rounded border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  {warning && (
                    <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                      {warning}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
              Misc cost (shipping/fees, minor units)
              <input
                type="number"
                min={0}
                step={1}
                value={miscCostCents}
                onChange={(event) => setMiscCostCents(Number(event.target.value))}
                className="rounded border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
              Misc comment (optional)
              <input
                value={miscComment}
                onChange={(event) => setMiscComment(event.target.value)}
                maxLength={200}
                className="rounded border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none"
                placeholder="Shipping / delivery fee / ..."
              />
            </label>
          </div>

          <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                Total cost:{" "}
                <span className="font-semibold text-slate-900">
                  {formatCurrency(totals.totalCostCents, currency, { locale })}
                </span>
              </div>
              <div>
                Expected margin:{" "}
                <span className={`font-semibold ${totals.marginCents < 0 ? "text-red-600" : "text-emerald-700"}`}>
                  {formatCurrency(totals.marginCents, currency, { locale })}
                </span>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={createPurchaseOrder.isPending}
            className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {createPurchaseOrder.isPending ? "Saving..." : "Record restock"}
          </button>
        </form>
      </section>

      <details className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">
          Recent restocks ({purchaseOrders.length})
        </summary>
        <div className="mt-4 space-y-4">
          {purchaseOrders.map((order) => (
            <details key={order.id} className="rounded-xl border border-slate-200 p-4">
              <summary className="cursor-pointer">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm font-semibold text-slate-900">{order.vendorName}</div>
                  <div className="text-sm font-semibold text-slate-900">
                    {formatCurrency(order.totalCostCents, currency, { locale })}
                  </div>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {order.createdAt.slice(0, 16).replace("T", " ")}
                  {order.purchaseChannel ? ` · ${order.purchaseChannel}` : ""}
                  {order.createdBy ? ` · ${order.createdBy.name ?? order.createdBy.email}` : ""}
                </div>
              </summary>

              <div className="mt-4 space-y-2 text-sm">
                {order.comment && <div className="text-slate-700">Comment: {order.comment}</div>}
                {order.receiptPath && <div className="text-slate-700">Receipt: {order.receiptPath}</div>}
                {order.miscCostCents > 0 && (
                  <div className="text-slate-700">
                    Misc: {formatCurrency(order.miscCostCents, currency, { locale })} {order.miscComment ? `— ${order.miscComment}` : ""}
                  </div>
                )}
                <div className="mt-2 overflow-hidden rounded-lg border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-2">Item</th>
                        <th className="px-4 py-2 text-right">Qty</th>
                        <th className="px-4 py-2 text-right">Unit cost</th>
                        <th className="px-4 py-2 text-right">Line</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {order.items.map((line) => (
                        <tr key={line.id}>
                          <td className="px-4 py-2 font-medium text-slate-900">{line.itemName}</td>
                          <td className="px-4 py-2 text-right text-slate-700">{line.quantity}</td>
                          <td className="px-4 py-2 text-right text-slate-700">
                            {formatCurrency(line.unitCostCents, currency, { locale })}
                          </td>
                          <td className="px-4 py-2 text-right font-semibold text-slate-900">
                            {formatCurrency(line.quantity * line.unitCostCents, currency, { locale })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </details>
          ))}

          {!purchaseOrders.length && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
              No restocks recorded yet.
            </div>
          )}
        </div>
      </details>
    </div>
  );
}

