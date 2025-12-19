-- AlterEnum
ALTER TYPE "LedgerCategory" ADD VALUE 'SETTLEMENT';

-- AlterEnum
ALTER TYPE "SettlementStatus" ADD VALUE 'BILLED';

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "comment" TEXT,
ADD COLUMN     "miscComment" TEXT,
ADD COLUMN     "miscCostCents" INTEGER DEFAULT 0,
ADD COLUMN     "purchaseChannel" TEXT,
ADD COLUMN     "receiptPath" TEXT;

