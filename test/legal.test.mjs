// Legal pages suite — the published documents under /legal.
//
// Run: npm test
//
// `docs/legal/*.md` is the source of truth; `scripts/embed-legal.mjs` turns it
// into `web/lib/legal.generated.ts` at build time and the site renders that.
// This suite guards the three ways that arrangement can go wrong:
//
//   - the published copy drifts from the committed document;
//   - a document that says not to publish it gets published;
//   - a published document links to one that is not published, which renders
//     as a dead phrase in a legal page.
//
// No database, no network — it reads files and the generated artifact.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const LEGAL = path.join(ROOT, "docs", "legal");
const GENERATED = path.join(ROOT, "web", "lib", "legal.generated.ts");

// The manifest, not the generator: importing the generator would *run* it and
// regenerate the artifact this suite is about to inspect.
const { PUBLISHED } = await import(path.join(ROOT, "scripts", "legal-manifest.mjs"));

let failures = 0;
function check(id, condition, detail) {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
  if (!ok) failures++;
}

const generated = await readFile(GENERATED, "utf-8");
const onDisk = (await readdir(LEGAL)).filter((f) => f.endsWith(".md")).sort();

// --- L1: the published copy is the committed document --------------------
{
  let drifted = null;
  for (const doc of PUBLISHED) {
    const markdown = await readFile(path.join(LEGAL, doc.file), "utf-8");
    if (!generated.includes(JSON.stringify(markdown))) {
      drifted = doc.file;
      break;
    }
  }
  check(
    "L1.1",
    drifted === null,
    `every published document is byte-identical to docs/legal/${drifted ? ` — ${drifted} differs` : " (4 of 4)"}`
  );
  check(
    "L1.2",
    PUBLISHED.every((d) => onDisk.includes(d.file)),
    "every published document exists on disk"
  );
}

// --- L2: a document that forbids publishing itself is not published ------
// The refund policy's own first line says not to publish it or link it from a
// checkout until the final terms are reviewed. Publishing it would breach an
// instruction written into the document, which no amount of good intent fixes.
{
  const unpublished = onDisk.filter((f) => !PUBLISHED.some((d) => d.file === f));
  check(
    "L2.1",
    unpublished.includes("REFUND-POLICY-PAID-CLOUD-DRAFT.md"),
    `the draft refund policy is not published (${unpublished.length} document(s) held back)`
  );

  let leaked = null;
  for (const file of unpublished) {
    const markdown = await readFile(path.join(LEGAL, file), "utf-8");
    // A distinctive line, so this catches the content being pasted into a
    // published document as well as the file being added to the allowlist.
    const fingerprint = markdown.split("\n").find((l) => l.trim().length > 60);
    if (fingerprint && generated.includes(fingerprint.trim())) {
      leaked = file;
      break;
    }
  }
  check("L2.2", leaked === null, `no unpublished text reached the site bundle${leaked ? ` — ${leaked}` : ""}`);
}

// --- L3: each published document says who operates the site --------------
{
  const missingOperator = [];
  const missingDate = [];
  for (const doc of PUBLISHED) {
    const markdown = await readFile(path.join(LEGAL, doc.file), "utf-8");
    if (!markdown.includes("Yutic")) {
      missingOperator.push(doc.file);
    }
    if (!/Last updated:/.test(markdown)) {
      missingDate.push(doc.file);
    }
  }
  check("L3.1", missingOperator.length === 0, `every published document names Yutic as operator${missingOperator.length ? ` — missing in ${missingOperator.join(", ")}` : ""}`);
  check("L3.2", missingDate.length === 0, `every published document carries a Last updated date${missingDate.length ? ` — missing in ${missingDate.join(", ")}` : ""}`);
}

// --- L4: no published document links to an unpublished one ---------------
{
  const dangling = [];
  for (const doc of PUBLISHED) {
    const markdown = await readFile(path.join(LEGAL, doc.file), "utf-8");
    for (const match of markdown.matchAll(/\]\((\.\/)?([A-Z0-9-]+\.md)\)/g)) {
      const target = match[2];
      if (!PUBLISHED.some((d) => d.file === target)) {
        dangling.push(`${doc.file} → ${target}`);
      }
    }
  }
  check(
    "L4.1",
    dangling.length === 0,
    `no published document links to an unpublished one${dangling.length ? ` — ${dangling.join(", ")}` : ""}`
  );
}

console.log(failures === 0 ? "\nlegal: all checks passed" : `\nlegal: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
