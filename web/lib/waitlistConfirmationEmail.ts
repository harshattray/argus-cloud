const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://normascope.com";

export const WAITLIST_CONFIRMATION_SUBJECT = "We heard you — Normascope early access";

/**
 * The confirmation is intentionally generic: it confirms the request without
 * repeating the address or implying a delivery date that has not been set.
 * Tables and inline styles keep the email usable across common clients.
 */
export function waitlistConfirmationHtml(): string {
  const logoUrl = `${SITE_URL}/normascope-wordmark.svg`;
  const yuticMarkUrl = `${SITE_URL}/yutic-teal-mark.svg`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${WAITLIST_CONFIRMATION_SUBJECT}</title>
  </head>
  <body style="margin:0;background:#f3e1da;color:#3a2523;font-family:Arial,Helvetica,sans-serif">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3e1da">
      <tr>
        <td align="center" style="padding:40px 20px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fcfbf9">
            <tr>
              <td style="padding:36px 36px 28px;border-bottom:1px solid #e4dfd7">
                <a href="${SITE_URL}" style="text-decoration:none">
                  <img src="${logoUrl}" width="115" height="36" alt="Normascope" style="display:block;border:0;max-width:100%;height:auto">
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:42px 36px 12px">
                <p style="margin:0 0 18px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;letter-spacing:2px;color:#a8736e">01 — NORMASCOPE</p>
                <h1 style="margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:30px;line-height:1.2;font-weight:500;letter-spacing:-1px;color:#3a2523">We heard you.</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 36px 38px;font-size:16px;line-height:1.7;color:#554e45">
                <p style="margin:0 0 18px">Thanks for joining the Normascope early-access list.</p>
                <p style="margin:0 0 18px">We’re working on the next step and will get back to you when there’s something useful to share.</p>
                <p style="margin:0">In the meantime, you can learn more at <a href="${SITE_URL}" style="color:#a8736e;text-decoration:underline">normascope.com</a>.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 36px 38px">
                <table role="presentation" cellpadding="0" cellspacing="0" style="font-family:Arial,Helvetica,sans-serif">
                  <tr>
                    <td style="border-right:2px solid #0e6b66;padding-right:14px">
                      <img src="${yuticMarkUrl}" width="34" height="37" alt="Yutic" style="display:block;border:0">
                    </td>
                    <td style="padding-left:14px">
                      <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px;color:#0b1f1e">Team Yutic</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 36px;background:#f1f6f4;font-size:11px;line-height:1.5;color:#8a8177">
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

export const WAITLIST_CONFIRMATION_TEXT = `We heard you.

Thanks for joining the Normascope early-access list.

We’re working on the next step and will get back to you when there’s something useful to share.

In the meantime, you can learn more at ${SITE_URL}.

Team Yutic

Normascope is a product from Yutic.`;
