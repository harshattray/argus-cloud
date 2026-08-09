# Finding — `npm install norma-scope` fails on npm 10 in projects using the Anthropic SDK

**Severity: high. This is a shipped install blocker**, not a CI quirk. It hit
the first real project we pointed the tool at.

> **Status: FIXED AND PUBLISHED** in `norma-scope@0.7.5`.
> Verified against the registry: `npm@10 install norma-scope` into a project on
> `@anthropic-ai/sdk@0.115.0` — the exact configuration that failed — now
> installs clean. The published manifest carries
> `"@anthropic-ai/sdk": ">=0.112.3"`.
> `normascope-mcp@0.2.2` carries the same fix and is **not yet published**.

## Symptom

```
npm error code ERESOLVE
npm error While resolving: norma-scope@0.7.3
npm error Found: @anthropic-ai/sdk@0.115.0
npm error Could not resolve dependency:
npm error peerOptional @anthropic-ai/sdk@"^0.112.3" from norma-scope@0.7.3
npm error Conflicting peer dependency: @anthropic-ai/sdk@0.112.5
```

`norma-scope` does not install at all. Not a warning — a non-zero exit.

## Cause

`package.json`:

```json
"peerDependencies":     { "@anthropic-ai/sdk": "^0.112.3" },
"peerDependenciesMeta": { "@anthropic-ai/sdk": { "optional": true } }
```

`optional: true` only tells npm the peer may be **absent**. It does not mean
"any version is acceptable". When the host project depends on the SDK at a
version outside `^0.112.3`, npm treats it as an unsatisfiable peer and fails
the install.

The SDK is a genuinely optional runtime import used only by `explain`. Pinning
it to a caret range buys nothing and costs the install.

## Why it was invisible locally

npm 11 tolerates this conflict; **npm 10 does not**.

| Environment | npm | Result |
|---|---|---|
| This laptop | 11.10.1 (Node 22) | installs fine |
| `ubuntu-latest`, `node-version: 20` | 10.x | **ERESOLVE, install fails** |

Node 20 is still the most common `setup-node` pin, so most CI hits the failing
path while the maintainer's machine never does.

## Reproducing

```bash
mkdir repro && cd repro
cat > package.json <<'EOF'
{ "name": "repro", "version": "1.0.0", "private": true,
  "dependencies": { "@anthropic-ai/sdk": "^0.115.0" } }
EOF
npx npm@10 install
npx npm@10 install --no-save norma-scope@0.7.3   # ERESOLVE
```

Verified: fails on npm 10, succeeds on npm 11.

## The fix, applied and verified

0.112.3 is a floor, not a range. Both manifests now declare:

```json
"peerDependencies": { "@anthropic-ai/sdk": ">=0.112.3" }
```

The upper bound bought nothing: `explain` loads the SDK through a dynamic
`import()` and already raises `MissingSdkError` when it is absent
(`src/explain/client.ts`), so the declaration is documentation, not
load-bearing.

Verified against **the published 0.7.5 on npm** — `npm@10 install norma-scope`
into a project already on `@anthropic-ai/sdk@0.115.0`, the exact configuration
that failed:

```
host sdk: 0.115.0
added 5 packages, and audited 13 packages in 1s
found 0 vulnerabilities
installed: 0.7.5
```

Clean install, host SDK untouched. The published manifest carries
`"@anthropic-ai/sdk": ">=0.112.3"`, and the registry reports 50 files /
142,735 bytes unpacked — matching the local `npm pack` exactly, with no `.d.ts`
and no source.

## Also fixed: the MCP version floor

`normascope-mcp` depended on `norma-scope@^0.7.0` while importing
`norma-scope/dist/config.js` directly. 0.7.0's `parseConfig` **rejects a
baseline-only config** — one with neither `figmaFileKey` nor a `source` block —
that 0.7.3+ accepts. With a stale 0.7.0 resolved, every MCP tool reported
`no valid .bridge/config.json` for a config the CLI itself parses fine. The
floor is now `^0.7.5`. That ships with `normascope-mcp@0.2.2`, which is **not
yet published**.

## Regression test

This shipped because nothing asserted the manifests stay installable.
`test/packaging.test.mjs` is now wired into `npm test`:

- **PKG-1** — an optional peer must express a floor, never an upper bound
  (caret, tilde, `<`, or exact pin)
- **PKG-2** — no `_comment` keys in any dependency map; npm resolves them as
  package names and breaks the install
- **PKG-3/4** — the MCP's `norma-scope` floor must sit between 0.7.5 and the
  root version

Confirmed it fails when the caret is restored:

```
FAIL  PKG-1 root/@anthropic-ai/sdk  optional peer must be a floor, not a bounded range — got "^0.112.3"
packaging: 1 failed
```

Full suite passes with the fix in place.

## Workaround — no longer needed

Before 0.7.5 shipped, the way around this was to install into a scratch prefix
so the dependency trees never met:

```bash
npm install --no-save --prefix "$RUNNER_TEMP/norma-cli" norma-scope@0.7.3
"$RUNNER_TEMP/norma-cli/node_modules/.bin/norma-scope" check --json
```

That is what [case-05](../case-05-pr-github-action/)'s workflow does, and it
still works. On 0.7.5 a plain `npm install norma-scope` is enough, so the
workflow can be simplified whenever that file is next touched.

## Related: this is not what a failing check should look like

The PR check went red with "1 failing check". That was **this install
crashing**, before Normascope ran — not a visual regression.

Normascope is non-blocking by design: `check --json` exits 0 whatever the
scores are, and only `--strict` exits 1. A flagged frame should surface as a
sticky comment, never as a red X. Worth stating explicitly in the Action's
README, because a red check that means "infrastructure broke" and a red check
that means "your UI changed" are very different signals and users will conflate
them.
