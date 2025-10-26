import "@/styles/globals.css";
import Link from "next/link";
import type { Metadata } from "next/types";
import type { ReactNode } from "react";
import { ReactQueryProvider } from "@/components/providers/react-query-provider";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Lab Cafe Hub",
  description: "Manage snack inventory, settlements, and ledger for the lab cafe.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={env.APP_LOCALE}>
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <ReactQueryProvider>
          <div className="flex min-h-screen flex-col">
            <header className="border-b border-slate-200 bg-white">
              <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
                <div className="flex items-center gap-2">
                  <Link
                    href="/"
                    className="rounded bg-brand px-2 py-1 text-sm font-semibold text-white transition hover:bg-brand-dark"
                  >
                    Lab Cafe Hub
                  </Link>
                  <span className="text-sm text-slate-500">
                    Fuel the lab, track the tab.
                  </span>
                </div>
              </div>
            </header>
            <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-8">
              {children}
            </main>
            <footer className="border-t border-slate-200 bg-white">
              <div className="mx-auto flex w-full max-w-6xl justify-between px-6 py-4 text-xs text-slate-500">
                <span>&copy; {new Date().getFullYear()} Lab Cafe Hub</span>
                <span>Made for lab snack economies.</span>
              </div>
            </footer>
          </div>
        </ReactQueryProvider>
      </body>
    </html>
  );
}
