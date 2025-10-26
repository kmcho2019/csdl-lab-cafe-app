import { notFound } from "next/navigation";
import Link from "next/link";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next/types";
import { remark } from "remark";
import remarkHtml from "remark-html";

import { DOCS, DOC_LOOKUP, type DocSlug } from "../registry";

type PageParams = {
  params: Promise<{ slug: string }>;
};

function isDocSlug(slug: string): slug is DocSlug {
  return slug in DOC_LOOKUP;
}

export async function generateStaticParams() {
  return DOCS.map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { slug } = await params;

  if (!isDocSlug(slug)) {
    return { title: "Documentation" } satisfies Metadata;
  }

  const doc = DOC_LOOKUP[slug];

  return {
    title: `${doc.title} | Documentation`,
    description: doc.description,
  } satisfies Metadata;
}

async function loadDocContent(docSlug: DocSlug) {
  const definition = DOC_LOOKUP[docSlug] as (typeof DOCS)[number];

  try {
    const absolutePath = path.resolve(process.cwd(), definition.file);
    const raw = await readFile(absolutePath, "utf-8");
    const format = definition.format ?? (definition.file.endsWith(".md") ? "markdown" : "code");

    if (format === "markdown") {
      const processed = await remark().use(remarkHtml).process(raw);
      return {
        definition,
        html: processed.toString(),
        format,
      } as const;
    }

    return {
      definition,
      code: raw,
      format,
    } as const;
  } catch (error) {
    console.error(`Failed to load documentation for slug "${docSlug}":`, error);
    return null;
  }
}

export default async function DocDetailPage({ params }: PageParams) {
  const { slug } = await params;

  if (!isDocSlug(slug)) {
    notFound();
  }

  const doc = await loadDocContent(slug);

  if (!doc) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm text-slate-500">Documentation</p>
          <h1 className="text-2xl font-semibold text-slate-900">{doc.definition.title}</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">{doc.definition.description}</p>
        </div>
        <Link
          href={{ pathname: "/docs" }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-brand hover:text-brand"
        >
          ← Back to docs
        </Link>
      </div>

      {doc.format === "markdown" ? (
        <article
          className="prose prose-slate max-w-none rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
          dangerouslySetInnerHTML={{ __html: doc.html }}
        />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <pre className="overflow-x-auto text-sm text-slate-800">
            <code>{doc.code}</code>
          </pre>
        </div>
      )}
    </div>
  );
}
