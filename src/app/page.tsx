import Link from "next/link";

const featureGroups = [
  {
    title: "Members",
    features: [
      "GitHub SSO with allowlist",
      "One-tap \"Take one\" actions",
      "Live tab balance and history",
      "View past settlement totals",
    ],
  },
  {
    title: "Admins",
    features: [
      "Inventory: items, restocks, write-offs",
      "Settlements: draft, finalize, export",
      "Ledger tracking with running balance",
      "Low stock and analytics insights",
    ],
  },
];

export default function HomePage() {
  return (
    <div className="flex flex-col gap-12">
      <section className="grid gap-10 rounded-xl bg-white p-10 shadow-sm">
        <div className="flex flex-col gap-4">
          <span className="text-sm font-semibold uppercase tracking-wide text-brand">Lab Cafe Hub</span>
          <h1 className="text-3xl font-bold text-slate-900 md:text-4xl">
            Bring clarity to your lab snack economy.
          </h1>
          <p className="max-w-2xl text-base text-slate-600">
            Track inventory, record who grabbed what, and close the books each settlement period with confidence.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href="/app"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow hover:bg-brand-dark"
          >
            Enter dashboard
          </Link>
          <Link
            href="/docs"
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-brand hover:text-brand"
          >
            View docs
          </Link>
        </div>
      </section>

      <section className="grid gap-8 md:grid-cols-2">
        {featureGroups.map((group) => (
          <div key={group.title} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">{group.title}</h2>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              {group.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <span className="mt-1 h-2.5 w-2.5 rounded-full bg-brand" aria-hidden />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-dashed border-brand/50 bg-brand/5 p-8">
        <h2 className="text-lg font-semibold text-slate-900">Built for transparency</h2>
        <p className="mt-2 text-sm text-slate-600">
          Every stock move, price change, and settlement action is logged. Exportable CSVs keep finance teams in sync.
        </p>
      </section>
    </div>
  );
}
