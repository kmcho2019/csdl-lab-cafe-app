import { Role } from "@prisma/client";
import { redirect } from "next/navigation";

import { UserAdminTable } from "@/components/admin/user-admin-table";
import { getAuthSession } from "@/server/auth/session";
import { prisma } from "@/server/db/client";

export default async function UsersPage() {
  const session = await getAuthSession();
  if (!session?.user) {
    redirect("/api/auth/signin");
  }

  if (session.user.role !== Role.ADMIN) {
    redirect("/app");
  }

  const users = await prisma.user.findMany({
    orderBy: [{ role: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      githubId: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  return (
    <UserAdminTable
      currentUserId={session.user.id}
      users={users.map((user) => ({
        id: user.id,
        name: user.name ?? "",
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        githubId: user.githubId ?? "",
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
      }))}
    />
  );
}
