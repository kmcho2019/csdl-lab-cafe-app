import { Role } from "@prisma/client";
import { redirect } from "next/navigation";

import { TransactionsManager } from "@/components/transactions/transactions-manager";
import { env } from "@/lib/env";
import { getAuthSession } from "@/server/auth/session";

export default async function TransactionsPage() {
  const session = await getAuthSession();
  if (!session?.user) {
    redirect("/api/auth/signin");
  }

  if (session.user.role !== Role.ADMIN) {
    redirect("/app");
  }

  return <TransactionsManager locale={env.APP_LOCALE} currency={env.APP_CURRENCY} />;
}

