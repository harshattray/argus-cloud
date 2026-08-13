/** Site-wide constants. Canonical origin is env-driven so the domain can
 *  change without a code edit (docs/normascopeWeb.md §12). */

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://normascope.com";

export const NPM_PACKAGE = "norma-scope";
export const NPM_URL = `https://www.npmjs.com/package/${NPM_PACKAGE}`;
export const MCP_PACKAGE = "normascope-mcp";
export const GITHUB_ACTION = "harshattray/norma";

export const TAGLINE = "Verify that what you shipped matches what you intended.";

/**
 * Public site navigation.
 *
 * This started at four items and the rule was that anything longer meant the
 * lean site was drifting back toward the long-form one under /pitch. That rule
 * is kept, but `/agents` earned its place: the MCP server is free, it is the
 * tool's strongest agent story, and it had no public URL at all — only prose in
 * §14 of the guide. A whole capability with no address is worse than a sixth
 * label. The ceiling is now six; anything past it needs a page removed first.
 */
export const NAV_LINKS = [
  { href: "/report", label: "The report" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/commands", label: "Commands" },
  { href: "/agents", label: "Agents" },
  { href: "/guide", label: "User guide" },
  { href: "/cloud", label: "Cloud" },
] as const;

/** The long-form tree behind the /pitch password gate. */
export const PITCH_NAV_LINKS = [
  { href: "/pitch/engine", label: "Engine" },
  { href: "/pitch/modes", label: "Modes" },
  { href: "/pitch/report", label: "Report" },
  { href: "/pitch/commands", label: "Commands" },
  { href: "/pitch/agents", label: "Agents" },
  { href: "/pitch/proof", label: "Proof" },
  { href: "/pitch/cloud", label: "Cloud" },
] as const;
