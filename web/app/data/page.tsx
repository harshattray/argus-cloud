import { consoleContext } from "../../lib/console";
import { AreaOutline, ConsoleGate, ConsoleShell } from "../_components/cloud/console-shell";

/**
 * Privacy and data — an area of the console with no workflows in it yet.
 *
 * The route exists because the area does: it is in `CONSOLE_AREAS`, so it is in
 * the navigation, so it has to answer. `AreaOutline` renders the area's own
 * `holds` list rather than restating it, so this page cannot drift from the
 * ownership map.
 *
 * **The role check is here, not only in the menu.** `consoleContext` makes the
 * same decision the navigation made, because a link that is not drawn is still
 * a URL somebody can type.
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Privacy and data — Normascope Cloud",
  robots: { index: false, follow: false },
};

export default async function DataPage() {
  const context = await consoleContext("data", "/data");
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
