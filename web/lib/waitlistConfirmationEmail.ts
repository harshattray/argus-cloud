import { emailShell, paragraph } from "argus-cloud/emailLayout.js";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://normascope.com";

export const WAITLIST_CONFIRMATION_SUBJECT = "We heard you — Normascope early access";

/**
 * The confirmation is intentionally generic: it confirms the request without
 * repeating the address or implying a delivery date that has not been set.
 *
 * **The design moved to `argus-cloud/emailLayout.js`** and the wording did not.
 * This template was the one that had been designed, and the sign-in email was
 * assembled from it by eye and had drifted; the shell is this layout, extracted,
 * so there is one of it rather than two that diverge. Tables and inline styles
 * for the reason that file gives — mail clients are not browsers.
 */
export function waitlistConfirmationHtml(): string {
  return emailShell({
    title: WAITLIST_CONFIRMATION_SUBJECT,
    preheader: "Thanks for joining the Normascope early-access list.",
    eyebrow: "01 — NORMASCOPE",
    heading: "We heard you.",
    siteUrl: SITE_URL,
    body: [
      paragraph("Thanks for joining the Normascope early-access list."),
      paragraph(
        "We\u2019re working on the next step and will get back to you when there\u2019s something useful to share."
      ),
      paragraph(
        `In the meantime, you can learn more at <a href="${SITE_URL}" style="color:#a8736e;text-decoration:underline">normascope.com</a>.`,
        { last: true }
      ),
    ].join("\n                "),
  });
}

export const WAITLIST_CONFIRMATION_TEXT = `We heard you.

Thanks for joining the Normascope early-access list.

We’re working on the next step and will get back to you when there’s something useful to share.

In the meantime, you can learn more at ${SITE_URL}.

Team Yutic

Normascope is a product from Yutic.`;
