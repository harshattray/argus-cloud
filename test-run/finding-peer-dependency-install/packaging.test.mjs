// Packaging suite — the published manifests must stay installable.
//
// Motivated by a real shipped bug: `@anthropic-ai/sdk` was declared as
// `^0.112.3` in peerDependencies with `peerDependenciesMeta.optional = true`.
// `optional` only tells npm the peer may be ABSENT — it does not mean any
// version satisfies it. So `npm install norma-scope` died with ERESOLVE in any
// project already depending on the SDK outside that caret range. npm 11
// tolerates the conflict and npm 10 does not, so it was invisible on the
// maintainer's machine and broke every Node 20 CI.
//
// These assertions are cheap and catch the whole class: an optional peer must
// never carry an upper bound.
//
// Run: node test/packaging.test.mjs

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let failures = 0;
function check(id, condition, detail) {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
  if (!ok) failures++;
}

const readJson = async (p) => JSON.parse(await readFile(p, "utf-8"));

const root = await readJson(path.join(ROOT, "package.json"));
const mcp = await readJson(path.join(ROOT, "packages", "normascope-mcp", "package.json"));

/**
 * A range with an upper bound (caret, tilde, <, or an exact pin) makes npm
 * fail the install when the host project sits outside it. Optional peers must
 * express a floor only.
 */
function hasUpperBound(range) {
  return /[\^~<]/.test(range) || /^\d/.test(range.trim());
}

for (const [label, pkg] of [
  ["root", root],
  ["mcp", mcp],
]) {
  const peers = pkg.peerDependencies ?? {};
  const meta = pkg.peerDependenciesMeta ?? {};

  for (const [name, range] of Object.entries(peers)) {
    const isOptional = meta[name]?.optional === true;
    if (!isOptional) continue;

    check(
      `PKG-1 ${label}/${name}`,
      !hasUpperBound(range),
      `optional peer must be a floor, not a bounded range — got "${range}"`,
    );
  }

  // A stray non-package key in a dependency map is resolved as a package name
  // and breaks the install. Easy to introduce when "documenting" a manifest.
  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    const names = Object.keys(pkg[field] ?? {});
    check(
      `PKG-2 ${label}/${field}`,
      names.every((n) => !n.startsWith("_")),
      `no comment keys in ${field} — npm resolves them as packages`,
    );
  }
}

// The MCP server imports norma-scope's internals directly
// (`norma-scope/dist/config.js`). A floor below the version that actually
// parses current configs means a valid project config is reported as invalid:
// 0.7.0's parseConfig rejects a baseline-only config that 0.7.3+ accepts.
const mcpFloor = (mcp.dependencies?.["norma-scope"] ?? "").replace(/^[\^~]/, "");
const cmp = (a, b) => {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
};

check(
  "PKG-3 mcp/norma-scope",
  cmp(mcpFloor, "0.7.4") >= 0,
  `floor must be >= 0.7.4 (baseline-only configs parse) — got "${mcpFloor}"`,
);

check(
  "PKG-4 mcp/norma-scope",
  cmp(mcpFloor, root.version) <= 0,
  `floor "${mcpFloor}" must not exceed the root version "${root.version}"`,
);

console.log(failures === 0 ? "\npackaging: all passed" : `\npackaging: ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
