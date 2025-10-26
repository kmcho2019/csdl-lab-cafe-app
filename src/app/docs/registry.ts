type DocFormat = "markdown" | "code";

export type DocSlug =
  | "agents"
  | "api-reference"
  | "database-schema"
  | "settlements-playbook"
  | "security"
  | "env-setup"
  | "admin-guide"
  | "hosting"
  | "troubleshooting";

type Definition = {
  slug: DocSlug;
  title: string;
  description: string;
  file: string;
  format: DocFormat;
};

type DocHref = `/docs/${DocSlug}`;

const definitions: ReadonlyArray<Definition> = [
  {
    slug: "agents",
    title: "Product Overview",
    description: "Understand members, admins, and automation agents.",
    file: "AGENTS.md",
    format: "markdown",
  },
  {
    slug: "api-reference",
    title: "API Reference",
    description: "REST endpoints for items, consumptions, settlements, and more.",
    file: "API_SPEC.md",
    format: "markdown",
  },
  {
    slug: "database-schema",
    title: "Database Schema",
    description: "Prisma data model backing the application.",
    file: "prisma/schema.prisma",
    format: "code",
  },
  {
    slug: "settlements-playbook",
    title: "Settlements Playbook",
    description: "Draft, finalize, void, and export settlement workflows.",
    file: "SETTLEMENTS.md",
    format: "markdown",
  },
  {
    slug: "security",
    title: "Security",
    description: "Threat model, RBAC, and compliance checklists.",
    file: "SECURITY.md",
    format: "markdown",
  },
  {
    slug: "env-setup",
    title: "Environment Setup",
    description: "Provision environment variables and local tooling.",
    file: "docs/ENV_SETUP.md",
    format: "markdown",
  },
  {
    slug: "admin-guide",
    title: "Admin Guide",
    description: "Daily operations for inventory, users, and settlements.",
    file: "docs/ADMIN_GUIDE.md",
    format: "markdown",
  },
  {
    slug: "hosting",
    title: "Hosting Guide",
    description: "Deploy with Vercel and Neon, plus alternative hosting notes.",
    file: "docs/HOSTING.md",
    format: "markdown",
  },
  {
    slug: "troubleshooting",
    title: "Troubleshooting",
    description: "Common errors and their fixes for operators and developers.",
    file: "docs/TROUBLESHOOTING.md",
    format: "markdown",
  },
] as const;

export type DocDefinition = Definition;

export const DOCS: ReadonlyArray<
  Definition & {
    href: DocHref;
  }
> = definitions.map((doc) => ({
  ...doc,
  href: `/docs/${doc.slug}` as DocHref,
}));

export const DOC_LOOKUP: Record<DocSlug, (typeof DOCS)[number]> = DOCS.reduce(
  (acc, doc) => {
    acc[doc.slug] = doc;
    return acc;
  },
  {} as Record<DocSlug, (typeof DOCS)[number]>,
);
