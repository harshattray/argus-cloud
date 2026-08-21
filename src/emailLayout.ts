/**
 * The one shell every transactional email is drawn in.
 *
 * **Why this exists.** There were two hand-built templates: the waitlist
 * confirmation, which had been designed, and the sign-in email, which had been
 * assembled from the same parts by eye. They already differed — different
 * heading size, different padding, no signature block on one of them — and the
 * sign-in one read as the poor relation of a design nobody had decided to
 * change. Two copies of a brand drift; this is CLAUDE.md rule 1 applied to a
 * table layout.
 *
 * It lives in the server package rather than in `web/lib` because `src/` cannot
 * import from `web/`, and the sign-in email is composed in `src/magicLink.ts`.
 * The waitlist route imports it the other way round, which is allowed.
 *
 * **Tables and inline styles, deliberately.** Mail clients are not browsers:
 * `<div>` layout, stylesheets and modern CSS are all unreliable, and Outlook in
 * particular renders through Word. Everything here is the boring, portable
 * shape, and that is the whole reason it should be written once.
 */

/** Where an email's images come from — never the deployment that sent it.
 *
 * A preview deployment sends real mail to a real inbox, and its own assets sit
 * behind Vercel Deployment Protection: a mail client's image proxy gets an SSO
 * redirect and renders a broken image. The marks are byte-identical on every
 * deployment, so there is nothing to gain by serving them from the sending one
 * and a broken logo to lose.
 *
 * Links are the opposite and stay on the sending deployment — a sign-in token
 * exists in that deployment's database and nowhere else.
 */
export function emailAssetOrigin(env: NodeJS.ProcessEnv = process.env): string {
  return (env.EMAIL_ASSET_ORIGIN?.trim() || "https://normascope.com").replace(/\/+$/, "");
}

/** The palette, matching `_styles/surface.module.css`. One copy, here. */
const INK = "#3a2523";
const INK_SOFT = "#554e45";
const INK_FAINT = "#8a8177";
const CLAY = "#a8736e";
const PAPER = "#fcfbf9";
const PAGE = "#f3e1da";
const RULE = "#e4dfd7";
const TEAL = "#0e6b66";
const TEAL_INK = "#0b1f1e";
const TEAL_BAND = "#f1f6f4";
const MONO = "ui-monospace,SFMono-Regular,Menlo,monospace";
const SANS = "Arial,Helvetica,sans-serif";

export interface EmailPage {
  /** The `<title>`, which is also what a client falls back to. */
  title: string;
  /**
   * The line an inbox shows beside the subject. Without one, a client picks the
   * first text it finds — which here is the word "Normascope" out of the
   * logo's alt attribute.
   */
  preheader: string;
  /** The small mono line above the heading. Omitted when absent. */
  eyebrow?: string;
  heading: string;
  /** The body, already marked up: paragraphs, buttons, whatever it needs. */
  body: string;
  /** The "Team Yutic" lockup. On by default; both emails currently show it. */
  signature?: boolean;
  /** Where the wordmark links. The *sending* deployment, not the asset origin. */
  siteUrl: string;
  env?: NodeJS.ProcessEnv;
}

/** A body paragraph, so callers do not each invent their own spacing. */
export function paragraph(html: string, options: { last?: boolean } = {}): string {
  return `<p style="margin:0 0 ${options.last ? "0" : "18px"}">${html}</p>`;
}

/**
 * The call to action.
 *
 * Rounded to match every button in the product. Outlook desktop ignores
 * `border-radius` and renders it square, which is what it did before this
 * existed — a degradation rather than a regression.
 */
export function button(href: string, label: string): string {
  return (
    `<p style="margin:0 0 26px">` +
    `<a href="${href}" style="display:inline-block;background:${INK};color:${PAPER};text-decoration:none;` +
    `padding:15px 30px;border-radius:9px;font-family:${MONO};font-size:15px;font-weight:500">${label}</a>` +
    `</p>`
  );
}

export function emailShell(page: EmailPage): string {
  const assets = emailAssetOrigin(page.env);
  const showSignature = page.signature ?? true;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <!-- Tells a client this design has one palette, so it renders it rather
         than inverting the panel and leaving the marks on their own ground. -->
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>${page.title}</title>
  </head>
  <body style="margin:0;background:${PAGE};color:${INK};font-family:${SANS}">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0">${page.preheader}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE}">
      <tr>
        <td align="center" style="padding:40px 20px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${PAPER}">
            <tr>
              <td style="padding:36px 36px 28px;border-bottom:1px solid ${RULE}">
                <a href="${page.siteUrl}" style="text-decoration:none;color:${INK}">
                  <!-- PNG, not SVG: Gmail does not render SVG at all, so this
                       was a broken image and blue underlined alt text in every
                       message either template ever sent. The alt text is styled
                       so that a client blocking images still shows the brand in
                       the brand's colour rather than as a default link. -->
                  <img src="${assets}/email-normascope-cloud.png" width="115" height="24" alt="Normascope"
                       style="display:block;border:0;max-width:100%;height:auto;color:${INK};font-family:${SANS};font-size:15px">
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:42px 36px 12px">
                ${
                  page.eyebrow
                    ? `<p style="margin:0 0 18px;font-family:${MONO};font-size:12px;letter-spacing:2px;color:${CLAY}">${page.eyebrow}</p>`
                    : ""
                }
                <h1 style="margin:0;font-family:${MONO};font-size:30px;line-height:1.2;font-weight:500;letter-spacing:-1px;color:${INK}">${page.heading}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 36px 38px;font-size:16px;line-height:1.7;color:${INK_SOFT}">
                ${page.body}
              </td>
            </tr>
            ${
              showSignature
                ? `<tr>
              <td style="padding:0 36px 38px">
                <table role="presentation" cellpadding="0" cellspacing="0" style="font-family:${SANS}">
                  <tr>
                    <td style="border-right:2px solid ${TEAL};padding-right:14px">
                      <img src="${assets}/email-yutic-mark.png" width="34" height="37" alt="Yutic"
                           style="display:block;border:0;color:${TEAL_INK};font-family:${SANS};font-size:13px">
                    </td>
                    <td style="padding-left:14px">
                      <div style="font-family:${MONO};font-size:14px;color:${TEAL_INK}">Team Yutic</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>`
                : ""
            }
            <tr>
              <td style="padding:18px 36px;background:${TEAL_BAND};font-size:11px;line-height:1.5;color:${INK_FAINT}">
                Normascope is a product from Yutic.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** The muted note that sits under a body — a fallback URL, a disclaimer. */
export function note(html: string): string {
  return `<p style="margin:0 0 18px;font-size:13px;line-height:1.6;color:${INK_FAINT}">${html}</p>`;
}

export const EMAIL_COLORS = { INK, INK_SOFT, INK_FAINT, CLAY, PAPER, MONO } as const;
