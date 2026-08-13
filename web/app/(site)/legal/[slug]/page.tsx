import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LEGAL_DOCUMENTS } from "../../../../lib/legal.generated";
import { renderMarkdown, type LinkResolver } from "../../../../lib/markdown";

/**
 * One legal document, rendered from `docs/legal/*.md`.
 *
 * The Markdown is embedded at build time by `scripts/embed-legal.mjs`, so the
 * committed document is the published document — there is no second copy to
 * fall out of date, and nothing is read from disk at request time.
 *
 * These pages are statically generated. A privacy policy that depends on a
 * database being reachable is a privacy policy that disappears during an
 * incident.
 */

export function generateStaticParams() {
  return LEGAL_DOCUMENTS.map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = LEGAL_DOCUMENTS.find((d) => d.slug === slug);
  if (!doc) {
    return {};
  }
  return {
    title: doc.title,
    description: doc.summary,
    alternates: { canonical: `/legal/${doc.slug}` },
  };
}

/** `./PRIVACY.md` in the source becomes `/legal/privacy` on the site. */
const resolveLink: LinkResolver = (href) => {
  if (!href.endsWith(".md")) {
    return href;
  }
  const file = href.replace(/^\.\//, "");
  const target = LEGAL_DOCUMENTS.find((d) => d.file === file);
  // Null rather than a guess: an unpublished document (the draft refund
  // policy) must not become a 404 link inside the Terms.
  return target ? `/legal/${target.slug}` : null;
};

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = LEGAL_DOCUMENTS.find((d) => d.slug === slug);
  if (!doc) {
    notFound();
  }

  return (
    <article className="w-full bg-paper px-4 text-text md:px-8">
      <div className="mx-auto max-w-2xl py-16 md:py-24">
        <Link href="/legal" className="eyebrow text-text/40 hover:text-text/70">
          ← Legal
        </Link>

        <h1 className="mt-6 mb-8 text-[32px] leading-tight font-semibold md:text-[40px]">
          {doc.title}
        </h1>

        <div className="text-[15px]">{renderMarkdown(doc.markdown, resolveLink)}</div>

        <div className="mt-14 border-t border-black/8 pt-6 text-[13px] text-text/40">
          Questions about this document:{" "}
          <a href="mailto:waitlist@normascope.com" className="underline underline-offset-2">
            waitlist@normascope.com
          </a>
        </div>
      </div>
    </article>
  );
}
