import Link from "next/link";
import type { Metadata } from "next";
import { LEGAL_DOCUMENTS } from "../../../lib/legal.generated";

/**
 * The legal index.
 *
 * It says what is *not* here as well as what is. The refund policy exists in
 * the repository as a draft whose own opening line forbids publishing it before
 * the final terms are reviewed and the checkout is configured — and there is
 * nothing to buy yet. Saying so is more honest than an index that quietly omits
 * it, and it matches what the site says everywhere else: Cloud is not on sale.
 */

export const metadata: Metadata = {
  title: "Legal",
  description:
    "Terms of Use, Privacy Policy, Cookie Notice and the AI and Cloud Disclosure for normascope.com and the Normascope Cloud waitlist.",
  alternates: { canonical: "/legal" },
};

export default function LegalIndex() {
  return (
    <section className="w-full bg-paper px-4 text-text md:px-8">
      <div className="mx-auto max-w-2xl py-16 md:py-24">
        <p className="eyebrow text-text/40">Legal</p>
        <h1 className="mt-3 mb-4 text-[32px] leading-tight font-semibold md:text-[40px]">
          The documents behind this site
        </h1>
        <p className="mb-12 text-[15px] leading-relaxed text-text/60">
          Normascope is operated by Yutic, a sole proprietorship of Harsha Attray. These cover the
          public website and the Cloud waitlist — nothing on this site is for sale, and joining the
          waitlist creates no account, subscription or payment obligation.
        </p>

        <ul className="space-y-3">
          {LEGAL_DOCUMENTS.map((doc) => (
            <li key={doc.slug}>
              <Link
                href={`/legal/${doc.slug}`}
                className="block rounded-xl border border-black/8 px-5 py-4 transition-colors hover:border-black/20"
              >
                <span className="text-[16px] font-semibold">{doc.title}</span>
                <span className="mt-1 block text-[13.5px] leading-relaxed text-text/55">
                  {doc.summary}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <p className="mt-10 text-[13.5px] leading-relaxed text-text/45">
          Paid Normascope Cloud will have its own subscription terms, refund policy, subprocessors
          notice and data-flow disclosure. Those are published before checkout is enabled, not
          before — Cloud is not currently available for purchase.
        </p>
      </div>
    </section>
  );
}
