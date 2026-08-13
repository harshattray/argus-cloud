// Which legal documents are published, and how they appear on the site.
//
// Data only, no side effects — `embed-legal.mjs` generates from it and
// `test/legal.test.mjs` checks against it. It lives apart from the generator
// because importing the generator *runs* it: the first version of the suite
// imported this list from `embed-legal.mjs`, silently regenerated the artifact
// it was about to inspect, and so could never have caught the drift it exists
// to catch.
//
// **Publication is an allowlist, never inferred from the directory.** Adding a
// document to `docs/legal/` does not publish it. `REFUND-POLICY-PAID-CLOUD-DRAFT.md`
// is the reason: its own first line forbids publishing it before the final
// terms are reviewed and the checkout is configured.

export const PUBLISHED = [
  {
    slug: "terms",
    file: "TERMS-OF-USE.md",
    title: "Terms of Use",
    summary: "What the website and the waitlist are, and what they are not.",
  },
  {
    slug: "privacy",
    file: "PRIVACY.md",
    title: "Privacy Policy",
    summary: "What a waitlist signup collects, why, and how to have it removed.",
  },
  {
    slug: "cookies",
    file: "COOKIE-NOTICE.md",
    title: "Cookie Notice",
    summary: "No advertising cookies, no cross-site tracking — and what is actually set.",
  },
  {
    slug: "ai-disclosure",
    file: "AI-AND-CLOUD-DISCLOSURE.md",
    title: "AI and Cloud Disclosure",
    summary: "What hosted AI will and will not decide, before any of it is switched on.",
  },
];
