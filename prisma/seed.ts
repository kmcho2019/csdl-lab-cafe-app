import { PrismaClient, Role, StockMovementType, LedgerCategory } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const currency = "USD";

  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      email: "admin@example.com",
      name: "Lab Admin",
      role: Role.ADMIN,
    },
  });

  await prisma.allowlistEntry.upsert({
    where: { value: "example.com" },
    update: {},
    create: {
      value: "example.com",
      note: "Default domain for local dev",
    },
  });

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
    const created = await prisma.item.upsert({
      where: { name: item.name },
      update: {
        priceCents: item.priceCents,
        lowStockThreshold: item.lowStockThreshold,
        currentStock: item.currentStock,
        currency: item.currency,
        category: item.category,
        unit: item.unit,
      },
      create: {
        ...item,
        priceHistory: {
          create: {
            priceCents: item.priceCents,
            currency: item.currency,
          },
        },
      },
    });

    await prisma.stockMovement.create({
      data: {
        itemId: created.id,
        type: StockMovementType.RESTOCK,
        quantity: item.currentStock,
        unitCostCents: item.priceCents - 50,
        byUserId: admin.id,
        note: "Initial stock load",
      },
    });
  }

  await prisma.ledgerEntry.create({
    data: {
      description: "Initial float",
      amountCents: 5000,
      category: LedgerCategory.RECEIPT,
      balanceAfterCents: 5000,
    },
  });

  console.log("Seed data applied ✨");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
