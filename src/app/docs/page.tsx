import Link from "next/link";

import { DOCS } from "./registry";

export default function DocsPage() {
  return (
    <div className="space-y-6">
      <header className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Documentation</h1>
        <p className="mt-2 text-sm text-slate-600">
          High-level guidance for Lab Cafe Hub. Browse built-in references without leaving the app.
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        {DOCS.map((doc) => (
          <Link
            key={doc.slug}
            href={doc.href}
            className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-brand hover:text-brand"
          >
            <h2 className="text-lg font-semibold text-slate-900">{doc.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{doc.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
