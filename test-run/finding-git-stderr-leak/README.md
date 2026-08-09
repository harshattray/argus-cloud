# Finding — git's "fatal:" error leaks into every run outside a repo

**Severity: low, but it is the first thing a new user sees.** Cosmetic, and a
two-word fix.

> **Status: FIXED AND PUBLISHED** in `norma-scope@0.7.5`. Verified against the
> published package: a `compare` run outside a git repo prints no `fatal:`.

## What happens

Run `compare` anywhere that isn't a git repository — a scratch folder, a
`/tmp` trial, a Docker layer, anyone evaluating the tool before adopting it —
and a fatal error prints in the middle of an otherwise clean, successful run:

```
Normascope
══════════════════════════════════════════════
  a.png                  →    0.0% aligned (0.0% unaligned) · SSIM 99 · ✓

fatal: not a git repository (or any of the parent directories): .git
  Report saved to .bridge/reports/report.html
  Open it to review and share with your designer.
══════════════════════════════════════════════
```

Nothing is broken. The run succeeded, the report is fine, the exit code is 0.
But `fatal:` sitting between a green checkmark and "Report saved" reads as a
crash, and it lands right where a first-time user is deciding whether the tool
is solid.

## Cause

`src/report.ts:13-21`:

```ts
function getGitInfo(): { branch: string; commit: string } {
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim();
    const commit = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
    return { branch, commit };
  } catch {
    return { branch: "unknown", commit: "unknown" };
  }
}
```

The `catch` correctly handles the non-zero exit and falls back to `"unknown"`.
The problem is upstream of it: **`execSync` inherits the parent's stderr by
default**, so git has already written to the terminal before the exception is
thrown. Catching the error cannot un-print it.

## The fix, applied

Redirect the child's stderr:

```ts
const git = (args: string) =>
  execSync(`git ${args}`, { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
```

Not a git repo is an expected, handled state — the fallback to `"unknown"`
exists precisely for it — so the error text has no audience.

## Not affected

`src/explain/codepointers.ts:91` calls `spawnSync("git", ["check-ignore", ...])`.
`spawnSync` defaults every stdio stream to `pipe`, so that one captures stderr
rather than inheriting it. Only `execSync` has the inherit-by-default
behaviour, and `report.ts` holds the only two calls.

## Related, same function

When git info is unavailable the report header renders:

```
BRANCH unknown    COMMIT unknown
```

That is honest and fine for a local run. Worth knowing for the showcase: any
report generated outside a repo carries `unknown/unknown` in its header, which
looks unfinished in a screenshot. All of the [case-02](../case-02-regression-portfolio/)
reports were therefore generated from a directory *inside* the portfolio repo
so they carry the real branch and commit.

## Reproducing

```bash
mkdir /tmp/nr && cd /tmp/nr
mkdir -p .bridge/design .bridge/screenshots
# ...any config + a matching PNG pair...
npx norma-scope compare
```
