"use client";

import { CloudErrorState } from "../_components/cloud/error-state";

/**
 * The boundary around `/repos`, `/repos/[repoId]` and the frame trend.
 *
 * Everything about what it shows is in `error-state.tsx`; this file exists
 * because Next resolves error boundaries by file position and a shared
 * component cannot be in two segments at once.
 *
 * **`retry`, not the older `reset`.** The prop was renamed in Next 16.3 —
 * `retry()` re-fetches the segment's data and re-renders it, where the previous
 * one only cleared the boundary and re-rendered with whatever was already
 * cached. These pages fail on a query, so clearing without re-fetching would
 * put the same failure back on screen and look like a dead button.
 */
export default function ReposError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <CloudErrorState retry={retry} />;
}
