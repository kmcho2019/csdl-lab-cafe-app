export type SettlementBreakdownItem = {
  itemId: string;
  itemName: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
};

export type SettlementPreviewLine = {
  userId: string;
  userName: string;
  userEmail: string;
  itemCount: number;
  totalCents: number;
  breakdown: SettlementBreakdownItem[];
};

export type ConsumptionForSettlement = {
  userId: string;
  user: { name: string | null; email: string };
  itemId: string;
  item: { name: string };
  quantity: number;
  priceAtTxCents: number;
};

type AggregatedItem = {
  itemId: string;
  itemName: string;
  unitPriceCents: number;
  quantity: number;
};

export function computeSettlementPreviewLines(consumptions: ConsumptionForSettlement[]) {
  const byUser = new Map<
    string,
    {
      userId: string;
      userName: string;
      userEmail: string;
      items: Map<string, AggregatedItem>;
    }
  >();

  for (const consumption of consumptions) {
    const userKey = consumption.userId;
    const userEntry =
      byUser.get(userKey) ??
      (() => {
        const created = {
          userId: consumption.userId,
          userName: consumption.user.name ?? "",
          userEmail: consumption.user.email,
          items: new Map<string, AggregatedItem>(),
        };
        byUser.set(userKey, created);
        return created;
      })();

    const itemKey = `${consumption.itemId}:${consumption.priceAtTxCents}`;
    const existing = userEntry.items.get(itemKey);
    if (existing) {
      existing.quantity += consumption.quantity;
    } else {
      userEntry.items.set(itemKey, {
        itemId: consumption.itemId,
        itemName: consumption.item.name,
        unitPriceCents: consumption.priceAtTxCents,
        quantity: consumption.quantity,
      });
    }
  }

  const lines: SettlementPreviewLine[] = Array.from(byUser.values())
    .map((entry) => {
      const breakdown = Array.from(entry.items.values())
        .map((item) => ({
          itemId: item.itemId,
          itemName: item.itemName,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          totalCents: item.unitPriceCents * item.quantity,
        }))
        .sort((a, b) => b.totalCents - a.totalCents || a.itemName.localeCompare(b.itemName));

      const itemCount = breakdown.reduce((sum, item) => sum + item.quantity, 0);
      const totalCents = breakdown.reduce((sum, item) => sum + item.totalCents, 0);

      return {
        userId: entry.userId,
        userName: entry.userName,
        userEmail: entry.userEmail,
        itemCount,
        totalCents,
        breakdown,
      };
    })
    .sort((a, b) => {
      const nameCompare = a.userName.localeCompare(b.userName, undefined, { sensitivity: "base" });
      if (nameCompare !== 0) {
        return nameCompare;
      }
      return a.userEmail.localeCompare(b.userEmail, undefined, { sensitivity: "base" });
    });

  return lines;
}

