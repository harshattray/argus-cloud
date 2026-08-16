import type { ReactNode } from "react";
import { Screenshot } from "../../_components/Screenshot";

/**
 * A screenshot with numbered callout pins keyed to a list beside it.
 *
 * The pins are decorative only: every pin's content is repeated in the ordered
 * list, which is the accessible source of truth and the sole presentation on
 * small screens. Nothing is ever conveyed by pin position alone.
 */

export interface Pin {
  /** Percent of the image's width/height, so pins scale with the image. */
  x: number;
  y: number;
  label: string;
  body: ReactNode;
}

/**
 * A screenshot with numbered callout pins keyed to a list beneath it.
 *
 * The pins are decorative-only: every pin's content is repeated in the ordered
 * list below, which is the accessible source of truth and the sole mobile
 * presentation. Nothing is conveyed by pin position alone.
 */
export const Annotated = ({
  src,
  alt,
  pins,
  dark = false,
}: {
  src: string;
  alt: string;
  pins: Pin[];
  dark?: boolean;
}) => (
  <div className="grid gap-7 lg:grid-cols-12 lg:gap-9 items-start">
    <div className="lg:col-span-7 min-w-0">
      <div
        className={`relative overflow-hidden rounded-xl border shadow-[0_1px_2px_rgba(28,27,26,0.04),0_14px_38px_rgba(28,27,26,0.09)] ${
          dark ? "border-white/10 bg-ink" : "border-black/8 bg-white"
        }`}
      >
        <Screenshot src={src} alt={alt} />
        {pins.map((pin, i) => (
          <span
            key={pin.label}
            aria-hidden
            className="absolute grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-clay text-[11px] font-bold text-white shadow-[0_0_0_3px_rgba(255,255,255,0.85)] numeric"
            style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
          >
            {i + 1}
          </span>
        ))}
      </div>
    </div>

    <ol className="lg:col-span-5 min-w-0 space-y-4">
      {pins.map((pin, i) => (
        <li key={pin.label} className="flex gap-3">
          <span
            className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold numeric ${
              dark ? "bg-white/10 text-white/70" : "bg-clay/15 text-clay-deep"
            }`}
          >
            {i + 1}
          </span>
          <div className="min-w-0">
            <p className={`title-sm ${dark ? "text-white" : "text-text"}`}>{pin.label}</p>
            <div
              className={`mt-0.5 text-[14px] leading-relaxed ${
                dark ? "text-white/55" : "text-text/60"
              }`}
            >
              {pin.body}
            </div>
          </div>
        </li>
      ))}
    </ol>
  </div>
);
