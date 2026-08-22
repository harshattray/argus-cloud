import { consoleContext } from "../../lib/console";
import { AreaOutline, ConsoleGate, ConsoleShell } from "../_components/cloud/console-shell";

/**
 * Overview — the console's front door.
 *
 * **It has no content yet, and it is a real route anyway.** The area exists in
 * `CONSOLE_AREAS`, so it is in the navigation, so it has to answer. A menu item
 * that 404s is worse than one that says what is coming.
 *
 * What it will hold is not restated here: `AreaOutline` renders the area's own
 * `holds` list, so the page and the ownership map cannot drift.
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Overview — Normascope Cloud",
  robots: { index: false, follow: false },
};

export default async function OverviewPage() {
  const context = await consoleContext("overview", "/overview");
  if (context.kind !== "ok") {
    return <ConsoleGate context={context} />;
  }
  return (
    <ConsoleShell
      context={context}
      title={context.area.label}
    >
      <AreaOutline area={context.area} />
    </ConsoleShell>
  );
}
