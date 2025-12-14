import { LedgerCategory, PrismaClient, Role, SettlementStatus, StockMovementType } from "@prisma/client";

import { computeSettlementPreviewLines } from "../src/server/settlements/compute";
import { getMonthRangeUtc } from "../src/server/settlements/period";

const prisma = new PrismaClient();

function isTruthy(value: string | undefined) {
  return ["1", "true", "yes", "y", "on"].includes((value ?? "").toLowerCase());
}

function createRng(seed: number) {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => (state = (state * 48271) % 2147483647) / 2147483647;
}

function randomInt(rng: () => number, min: number, max: number) {
  return min + Math.floor(rng() * (max - min + 1));
}

function pickOne<T>(rng: () => number, values: T[]) {
  return values[Math.floor(rng() * values.length)]!;
}

function isoMonth(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

async function ensureAllowlist(value: string, note: string) {
  const existing = await prisma.allowlistEntry.findFirst({
    where: { value },
    select: { id: true },
  });

  if (existing) {
    return;
  }

  await prisma.allowlistEntry.create({
    data: { value, note },
  });
}

async function upsertItemByName(item: {
  name: string;
  priceCents: number;
  lowStockThreshold: number;
  currentStock: number;
  category?: string;
  unit?: string;
  currency: string;
}) {
  const existing = await prisma.item.findFirst({
    where: { name: item.name },
    select: { id: true, priceCents: true, currency: true },
  });

  if (!existing) {
    return prisma.item.create({
      data: {
        name: item.name,
        category: item.category,
        unit: item.unit,
        priceCents: item.priceCents,
        currency: item.currency,
        currentStock: item.currentStock,
        lowStockThreshold: item.lowStockThreshold,
        priceHistory: {
          create: {
            priceCents: item.priceCents,
            currency: item.currency,
          },
        },
      },
    });
  }

  const updated = await prisma.item.update({
    where: { id: existing.id },
    data: {
      category: item.category,
      unit: item.unit,
      currency: item.currency,
      priceCents: item.priceCents,
      currentStock: item.currentStock,
      lowStockThreshold: item.lowStockThreshold,
    },
  });

  if (existing.priceCents !== item.priceCents || existing.currency !== item.currency) {
    await prisma.itemPriceHistory.create({
      data: {
        itemId: existing.id,
        priceCents: item.priceCents,
        currency: item.currency,
      },
    });
  }

  return updated;
}

async function ensureOpeningLedgerBalance() {
  const existing = await prisma.ledgerEntry.findFirst({
    where: { description: "Initial float" },
    select: { id: true },
  });

  if (existing) {
    return;
  }

  await prisma.ledgerEntry.create({
    data: {
      description: "Initial float",
      amountCents: 5000,
      category: LedgerCategory.RECEIPT,
      balanceAfterCents: 5000,
    },
  });
}

async function seedDemoData(adminId: string, currency: string) {
  const existingConsumptions = await prisma.consumption.count();
  if (existingConsumptions > 0) {
    console.log("Demo seed skipped: database already has consumption records.");
    return;
  }

  const demoUsers = [
    { name: "Casey Park", email: "casey@example.com" },
    { name: "Alex Kim", email: "alex@example.com" },
    { name: "Minji Lee", email: "minji@example.kr" },
    { name: "Jiwon Choi", email: "jiwon@example.kr" },
    { name: "Morgan Chen", email: "morgan@example.com" },
    { name: "Sora Han", email: "sora@example.kr" },
    { name: "Taylor Singh", email: "taylor@example.com" },
    { name: "Eunseo Park", email: "eunseo@example.kr" },
    { name: "Noah Garcia", email: "noah@example.com" },
    { name: "Yuna Kim", email: "yuna@example.kr" },
  ];

  for (const user of demoUsers) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: { name: user.name, isActive: true, role: Role.MEMBER },
      create: { name: user.name, email: user.email, role: Role.MEMBER },
    });
  }

  const demoItems = [
    { name: "Cold Brew", priceCents: 350, lowStockThreshold: 6, currentStock: 24, category: "Drinks", unit: "bottle", currency },
    { name: "Americano", priceCents: 300, lowStockThreshold: 8, currentStock: 30, category: "Drinks", unit: "cup", currency },
    { name: "Sparkling Water", priceCents: 200, lowStockThreshold: 12, currentStock: 60, category: "Drinks", unit: "can", currency },
    { name: "Energy Bar", priceCents: 250, lowStockThreshold: 10, currentStock: 48, category: "Snacks", unit: "bar", currency },
    { name: "Chocolate Cookie", priceCents: 180, lowStockThreshold: 12, currentStock: 72, category: "Snacks", unit: "pack", currency },
    { name: "Cup Noodles", priceCents: 400, lowStockThreshold: 6, currentStock: 24, category: "Meals", unit: "cup", currency },
    { name: "Instant Rice", priceCents: 450, lowStockThreshold: 6, currentStock: 18, category: "Meals", unit: "bowl", currency },
    { name: "Protein Shake", priceCents: 320, lowStockThreshold: 8, currentStock: 28, category: "Drinks", unit: "bottle", currency },
    { name: "Trail Mix", priceCents: 220, lowStockThreshold: 10, currentStock: 40, category: "Snacks", unit: "bag", currency },
    { name: "Green Tea", priceCents: 160, lowStockThreshold: 10, currentStock: 50, category: "Drinks", unit: "bottle", currency },
    { name: "Latte", priceCents: 380, lowStockThreshold: 8, currentStock: 24, category: "Drinks", unit: "cup", currency },
    { name: "Chips", priceCents: 210, lowStockThreshold: 10, currentStock: 45, category: "Snacks", unit: "bag", currency },
  ];

  for (const item of demoItems) {
    await upsertItemByName(item);
  }

  const users = await prisma.user.findMany({
    where: { role: Role.MEMBER, isActive: true, email: { in: demoUsers.map((user) => user.email) } },
    select: { id: true },
  });

  const items = await prisma.item.findMany({
    where: { isActive: true, name: { in: demoItems.map((item) => item.name) } },
    select: { id: true, priceCents: true, currency: true, currentStock: true },
  });

  const stockByItemId = new Map(items.map((item) => [item.id, item.currentStock]));
  const rng = createRng(Number(process.env.DEMO_SEED_VALUE ?? 42));
  const demoDays = Number(process.env.DEMO_DAYS ?? 120);
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - demoDays);

  const consumptionData: Array<{
    userId: string;
    itemId: string;
    quantity: number;
    priceAtTxCents: number;
    currency: string;
    createdAt: Date;
  }> = [];

  const stockMoveData: Array<{
    itemId: string;
    type: StockMovementType;
    quantity: number;
    unitCostCents?: number;
    note?: string;
    byUserId?: string;
    createdAt: Date;
  }> = [];

  for (const item of items) {
    stockMoveData.push({
      itemId: item.id,
      type: StockMovementType.RESTOCK,
      quantity: item.currentStock,
      unitCostCents: Math.max(item.priceCents - 50, 0),
      note: "Demo initial stock",
      byUserId: adminId,
      createdAt: new Date(start),
    });
  }

  for (let dayOffset = 0; dayOffset < demoDays; dayOffset += 1) {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + dayOffset);

    const purchasesToday = randomInt(rng, 6, 22);
    for (let i = 0; i < purchasesToday; i += 1) {
      const user = pickOne(rng, users);
      const item = pickOne(rng, items);
      const quantity = randomInt(rng, 1, 2);

      const createdAt = new Date(day);
      createdAt.setUTCHours(randomInt(rng, 8, 20), randomInt(rng, 0, 59), randomInt(rng, 0, 59), 0);

      const currentStock = stockByItemId.get(item.id) ?? 0;
      if (currentStock < quantity) {
        const restockQuantity = randomInt(rng, 12, 40);
        stockByItemId.set(item.id, currentStock + restockQuantity);
        stockMoveData.push({
          itemId: item.id,
          type: StockMovementType.RESTOCK,
          quantity: restockQuantity,
          unitCostCents: Math.max(item.priceCents - 60, 0),
          note: "Demo restock",
          byUserId: adminId,
          createdAt,
        });
      }

      stockByItemId.set(item.id, (stockByItemId.get(item.id) ?? 0) - quantity);

      consumptionData.push({
        userId: user.id,
        itemId: item.id,
        quantity,
        priceAtTxCents: item.priceCents,
        currency: item.currency,
        createdAt,
      });

      stockMoveData.push({
        itemId: item.id,
        type: StockMovementType.CONSUME,
        quantity,
        byUserId: user.id,
        createdAt,
      });
    }
  }

  await prisma.consumption.createMany({ data: consumptionData });
  await prisma.stockMovement.createMany({ data: stockMoveData });

  for (const [itemId, finalStock] of stockByItemId.entries()) {
    await prisma.item.update({ where: { id: itemId }, data: { currentStock: finalStock } });
  }

  const lastMonthStart = new Date();
  lastMonthStart.setUTCDate(1);
  lastMonthStart.setUTCHours(0, 0, 0, 0);
  lastMonthStart.setUTCMonth(lastMonthStart.getUTCMonth() - 1);

  const month = isoMonth(lastMonthStart);
  const { startDate, endDate } = getMonthRangeUtc(month);

  const existingSettlement = await prisma.settlement.findFirst({
    where: { startDate, endDate, status: { not: SettlementStatus.VOID } },
    select: { id: true },
  });

  if (!existingSettlement) {
    const settlement = await prisma.settlement.create({
      data: {
        startDate,
        endDate,
        status: SettlementStatus.FINALIZED,
        createdById: adminId,
        finalizedAt: new Date(),
        notes: "Demo seeded settlement",
      },
    });

    const monthConsumptions = await prisma.consumption.findMany({
      where: {
        settlementId: null,
        reversedAt: null,
        createdAt: { gte: startDate, lte: endDate },
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        item: { select: { id: true, name: true } },
      },
    });

    const previewLines = computeSettlementPreviewLines(
      monthConsumptions.map((consumption) => ({
        userId: consumption.userId,
        user: consumption.user,
        itemId: consumption.itemId,
        item: consumption.item,
        quantity: consumption.quantity,
        priceAtTxCents: consumption.priceAtTxCents,
      })),
    );

    await prisma.consumption.updateMany({
      where: { id: { in: monthConsumptions.map((consumption) => consumption.id) }, settlementId: null },
      data: { settlementId: settlement.id },
    });

    for (const line of previewLines) {
      await prisma.settlementLine.create({
        data: {
          settlementId: settlement.id,
          userId: line.userId,
          itemCount: line.itemCount,
          totalCents: line.totalCents,
          breakdownJson: { items: line.breakdown },
        },
      });
    }
  }
}

async function main() {
  const currency = (process.env.APP_CURRENCY ?? "USD").toUpperCase();
  const demoSeed = isTruthy(process.env.DEMO_SEED);

  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      email: "admin@example.com",
      name: "Lab Admin",
      role: Role.ADMIN,
    },
  });

  await prisma.user.upsert({
    where: { email: "member@example.com" },
    update: {
      name: "홍길동",
    },
    create: {
      email: "member@example.com",
      name: "홍길동",
      role: Role.MEMBER,
    },
  });

  await ensureAllowlist("example.com", "Default domain for local dev");
  await ensureAllowlist("example.kr", "Korean domain for local dev");

  if (demoSeed) {
    await seedDemoData(admin.id, currency);
    console.log(`Demo seed applied (DEMO_SEED=1). Try /app/kiosk, /app/settlements, /app/analytics.`);
  } else {
    const items = [
      {
        name: "Cold Brew",
        priceCents: 350,
        lowStockThreshold: 6,
        currentStock: 24,
        category: "Drinks",
        unit: "bottle",
        currency,
      },
      {
        name: "Energy Bar",
        priceCents: 250,
        lowStockThreshold: 10,
        currentStock: 48,
        category: "Snacks",
        unit: "bar",
        currency,
      },
      {
        name: "Sparkling Water",
        priceCents: 200,
        lowStockThreshold: 12,
        currentStock: 60,
        category: "Drinks",
        unit: "can",
        currency,
      },
    ];

    for (const item of items) {
      const created = await upsertItemByName(item);

      await prisma.stockMovement.create({
        data: {
          itemId: created.id,
          type: StockMovementType.RESTOCK,
          quantity: item.currentStock,
          unitCostCents: Math.max(item.priceCents - 50, 0),
          byUserId: admin.id,
          note: "Initial stock load",
        },
      });
    }

    await ensureOpeningLedgerBalance();
    console.log("Seed data applied.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
