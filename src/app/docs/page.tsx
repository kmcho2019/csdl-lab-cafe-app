const docs = [
  {
    title: "Product Overview",
    description: "Understand members, admins, and automation agents.",
    href: "/AGENTS.md",
  },
  {
    title: "API Reference",
    description: "REST endpoints for items, consumptions, settlements, and more.",
    href: "/API_SPEC.md",
  },
  {
    title: "Database Schema",
    description: "Prisma data model backing the application.",
    href: "/DB_SCHEMA.prisma",
  },
  {
    title: "Settlements Playbook",
    description: "Draft, finalize, void, and export settlement workflows.",
    href: "/SETTLEMENTS.md",
  },
  {
    title: "Security",
    description: "Threat model, RBAC, and compliance checklists.",
    href: "/SECURITY.md",
  },
];

export default function DocsPage() {
  return (
    <div className="space-y-6">
      <header className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Documentation</h1>
        <p className="mt-2 text-sm text-slate-600">
          High-level guidance for Lab Cafe Hub. Files open in a new tab when hosted.
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        {docs.map((doc) => (
          <a
            key={doc.href}
            href={doc.href}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-brand hover:text-brand"
          >
            <h2 className="text-lg font-semibold text-slate-900">{doc.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{doc.description}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
