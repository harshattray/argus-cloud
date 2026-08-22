"use client";

import { CloudErrorState } from "../_components/cloud/error-state";

/**
 * The boundary around the share-token report at `/r/[runId]`.
 *
 * Same component as `/repos`, deliberately. A share link goes to somebody
 * outside the organization — a designer, a reviewer, a client — and they are
 * the reader least able to tell a broken page from an empty one, because they
 * have no other page on this product to compare it against. If anything, the
 * distinction between "nothing to show" and "this failed" matters more here.
 *
 * The "Back to Cloud" action goes to `/repos`, which a share viewer cannot
 * open: they land on the sign-in page. That is the correct destination anyway —
 * it is the only door this product has, and the alternative is an action that
 * goes nowhere. What must not happen is a link back into the organization's own
 * pages, which would widen a share into navigation it never granted.
 */
export default function ShareReportError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <CloudErrorState retry={retry} />;
}
