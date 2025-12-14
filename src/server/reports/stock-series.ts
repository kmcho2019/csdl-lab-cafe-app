export type StockMovementForSeries = {
  type: "RESTOCK" | "CONSUME" | "WRITE_OFF" | "ADJUST";
  quantity: number;
  createdAt: Date;
};

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function stockDelta(type: StockMovementForSeries["type"], quantity: number) {
  switch (type) {
    case "RESTOCK":
      return quantity;
    case "CONSUME":
      return -1 * quantity;
    case "WRITE_OFF":
      return -1 * quantity;
    case "ADJUST":
      return quantity;
    default: {
      const exhaustive: never = type;
      return exhaustive;
    }
  }
}

export function buildDailyStockSeries(params: {
  currentStock: number;
  startDate: Date;
  endDate: Date;
  movements: StockMovementForSeries[];
}) {
  const { currentStock, startDate, endDate, movements } = params;
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf()) || start > end) {
    throw new Error("INVALID_RANGE");
  }

  const deltasByDay = new Map<string, number>();
  let windowDelta = 0;

  for (const movement of movements) {
    if (movement.createdAt < start || movement.createdAt > end) {
      continue;
    }

    const delta = stockDelta(movement.type, movement.quantity);
    windowDelta += delta;

    const dayKey = isoDay(movement.createdAt);
    deltasByDay.set(dayKey, (deltasByDay.get(dayKey) ?? 0) + delta);
  }

  const startingStock = currentStock - windowDelta;
  const labels: string[] = [];
  const values: number[] = [];

  let runningStock = startingStock;
  for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const dayKey = isoDay(cursor);
    labels.push(dayKey);
    runningStock += deltasByDay.get(dayKey) ?? 0;
    values.push(runningStock);
  }

  return { labels, values, startingStock };
}

