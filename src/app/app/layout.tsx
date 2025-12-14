import { Role } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";

import { getAuthSession } from "@/server/auth/session";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAuthSession();

  if (!session?.user) {
    redirect("/api/auth/signin");
  }

  const baseLinks = [
    { href: "/app", label: "Dashboard" },
    { href: "/app/kiosk", label: "Kiosk" },
  ] satisfies Array<{
    href: Route;
    label: string;
  }>;
  const adminLinks = [
    { href: "/app/inventory", label: "Inventory" },
    { href: "/app/users", label: "People" },
    { href: "/app/ledger", label: "Ledger" },
    { href: "/app/settlements", label: "Settlements" },
  ] satisfies Array<{ href: Route; label: string }>;

  const links =
    session.user.role === Role.ADMIN
      ? [...baseLinks, ...adminLinks]
      : baseLinks;

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-sm font-semibold text-slate-700">Signed in as</p>
          <p className="text-lg font-semibold text-slate-900">
            {session.user.name ?? session.user.email}
          </p>
          <p className="text-xs uppercase tracking-wide text-slate-500">{session.user.role}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:border-brand hover:text-brand"
            >
              {link.label}
            </Link>
          ))}
          <form action="/api/auth/signout" method="post">
            <button
              type="submit"
              className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
      <div>{children}</div>
    </div>
  );
}
