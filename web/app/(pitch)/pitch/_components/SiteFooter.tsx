import Link from "next/link";
import { NAV_LINKS, NPM_URL, MCP_PACKAGE, NPM_PACKAGE } from "../../../../lib/site";
import { Wordmark } from "./primitives";
import { WaitlistForm } from "./WaitlistForm";
import { YuticEndorsement } from "../../../_components/YuticEndorsement";

export function SiteFooter() {
  return (
    <footer className="w-full bg-ink text-white px-4 md:px-8">
      <div className="max-w-6xl mx-auto py-16 md:py-20">
        <div className="flex flex-col lg:flex-row gap-12 lg:gap-20">
          <div className="lg:w-96 shrink-0">
            <Wordmark size="md" className="mb-5 [&>span]:text-white" />
            <p className="text-sm text-white/45 leading-relaxed mb-6">
              Free and local forever. Normascope Cloud adds the one thing a laptop
              structurally cannot: memory of every run before this one.
            </p>
            <WaitlistForm source="footer" tone="dark" cta="Request access" />
            {/* Yutic's endorsement, once on this surface. The line in the
                bottom rule is an operator statement, not the endorsement. */}
            <YuticEndorsement tone="dark" className="mt-8" />
          </div>

          <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-8">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/25 mb-4">
                Product
              </p>
              <ul className="flex flex-col gap-2.5">
                {NAV_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-white/55 hover:text-white transition-colors">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/25 mb-4">
                Install
              </p>
              <ul className="flex flex-col gap-2.5">
                <li>
                  <a
                    href={NPM_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-white/55 hover:text-white transition-colors font-mono"
                  >
                    {NPM_PACKAGE}
                  </a>
                </li>
                <li>
                  <a
                    href={`https://www.npmjs.com/package/${MCP_PACKAGE}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-white/55 hover:text-white transition-colors font-mono"
                  >
                    {MCP_PACKAGE}
                  </a>
                </li>
                <li>
                  <a
                    href="/run/report.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-white/55 hover:text-white transition-colors"
                  >
                    Sample report
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/25 mb-4">
                Guarantees
              </p>
              <ul className="flex flex-col gap-2.5 text-sm text-white/40 leading-snug">
                <li>Never blocks a build</li>
                <li>No AI in the score</li>
                <li>Runs fully offline</li>
                <li>Apache-2.0 client</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-14 pt-6 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs text-white/25">
            © {new Date().getFullYear()} Normascope. Screenshots never leave your machines.
          </p>
          <p className="text-xs text-white/25">
            Normascope is operated by Yutic, a sole proprietorship of Harsha Attray.
          </p>
        </div>
      </div>
    </footer>
  );
}
