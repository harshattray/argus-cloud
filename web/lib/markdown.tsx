import Link from "next/link";
import type { ReactNode } from "react";

/**
 * A small Markdown renderer for the legal pages.
 *
 * Deliberately not a Markdown library. It supports exactly what
 * `docs/legal/*.md` uses — headings, paragraphs, bullet and numbered lists,
 * bold, italic, inline code and links — and nothing else. Adding a parser and
 * a sanitiser to render four documents we wrote ourselves would be more
 * dependency surface than the feature is worth, and `npm audit` is already
 * carrying three advisories nobody wants to grow.
 *
 * **It builds React elements, never HTML strings.** No `dangerouslySetInnerHTML`
 * anywhere, so there is no injection question to reason about even if a
 * document later includes text from somewhere less trusted than our own repo.
 *
 * Unknown syntax degrades to plain text rather than throwing. A legal page that
 * renders an unstyled line is a blemish; one that 500s is a missing policy.
 */

/** Rewrites in-document links (`./PRIVACY.md`) to site routes. */
export type LinkResolver = (href: string) => string | null;

const INLINE = /(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*)|(_[^_]+_)|(`[^`]+`)/g;

function inline(text: string, resolve: LinkResolver | undefined, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  INLINE.lastIndex = 0;
  while ((match = INLINE.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index));
    }
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;

    if (token.startsWith("[")) {
      const [, label, href] = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token) ?? [];
      const target = resolve ? resolve(href) : href;
      if (!target) {
        // An unresolvable link renders as its own text. A dead link in a
        // privacy policy is worse than a plain phrase.
        nodes.push(label);
      } else if (target.startsWith("/")) {
        nodes.push(
          <Link key={key} href={target} className="underline underline-offset-2 hover:text-text">
            {label}
          </Link>
        );
      } else {
        nodes.push(
          <a
            key={key}
            href={target}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-text"
          >
            {label}
          </a>
        );
      }
    } else if (token.startsWith("**")) {
      nodes.push(
        <strong key={key} className="font-semibold text-text">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("_")) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else {
      nodes.push(
        <code key={key} className="font-mono text-[0.9em]">
          {token.slice(1, -1)}
        </code>
      );
    }
    last = match.index + token.length;
  }

  if (last < text.length) {
    nodes.push(text.slice(last));
  }
  return nodes;
}

/** Two trailing spaces are a hard line break — the date block relies on it. */
function withBreaks(text: string, resolve: LinkResolver | undefined, key: string): ReactNode[] {
  const lines = text.split(/ {2,}\n/);
  return lines.flatMap((line, i) => [
    ...inline(line.replace(/\n/g, " "), resolve, `${key}-${i}`),
    i < lines.length - 1 ? <br key={`${key}-br-${i}`} /> : null,
  ]);
}

export function renderMarkdown(markdown: string, resolve?: LinkResolver): ReactNode[] {
  // The H1 is the document title, which the page renders in its own masthead.
  const body = markdown.replace(/^#\s+.*\n/, "");
  const blocks = body.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);

  return blocks.map((block, index) => {
    const key = `b${index}`;

    if (block.startsWith("## ")) {
      return (
        <h2 key={key} className="mt-12 mb-3 text-[19px] font-semibold leading-snug text-text first:mt-0">
          {inline(block.slice(3).trim(), resolve, key)}
        </h2>
      );
    }
    if (block.startsWith("# ")) {
      return (
        <h2 key={key} className="mt-12 mb-3 text-[21px] font-semibold leading-snug text-text first:mt-0">
          {inline(block.slice(2).trim(), resolve, key)}
        </h2>
      );
    }

    const lines = block.split("\n");

    if (lines.every((l) => /^[-*]\s+/.test(l.trim()))) {
      return (
        <ul key={key} className="mb-5 list-disc space-y-1.5 pl-5 text-text/70">
          {lines.map((line, i) => (
            <li key={`${key}-${i}`}>{inline(line.trim().replace(/^[-*]\s+/, ""), resolve, `${key}-${i}`)}</li>
          ))}
        </ul>
      );
    }

    if (lines.every((l) => /^\d+\.\s+/.test(l.trim()))) {
      return (
        <ol key={key} className="mb-5 list-decimal space-y-1.5 pl-5 text-text/70">
          {lines.map((line, i) => (
            <li key={`${key}-${i}`}>{inline(line.trim().replace(/^\d+\.\s+/, ""), resolve, `${key}-${i}`)}</li>
          ))}
        </ol>
      );
    }

    return (
      <p key={key} className="mb-5 leading-relaxed text-text/70">
        {withBreaks(block, resolve, key)}
      </p>
    );
  });
}
