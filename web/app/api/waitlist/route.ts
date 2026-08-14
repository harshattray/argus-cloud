import { NextResponse } from "next/server";
import { getDb } from "../../../lib/db";
import { emailProblem, normaliseEmail, EMAIL_MESSAGE } from "../../../lib/waitlistEmail";
import {
  WAITLIST_CONFIRMATION_SUBJECT,
  WAITLIST_CONFIRMATION_TEXT,
  waitlistConfirmationHtml,
} from "../../../lib/waitlistConfirmationEmail";

/**
 * Waitlist signup (docs/normascopeWeb.md §11).
 *
 * This is the first genuinely public write endpoint in the codebase, and
 * there is no shared rate limiter to lean on (FinishedSPEC.md §7 #6), so the
 * defences are local and layered:
 *
 *   - a honeypot field plus a minimum time-to-submit, which stops naive bots
 *   - a per-IP token bucket, which slows down the rest
 *   - a UNIQUE constraint doing the actual deduplication
 *
 * The per-IP bucket is in-process. On serverless that means per instance, not
 * global — it raises the cost of abuse without pretending to be a real limiter.
 * A durable one belongs in the same place the API-key rate limit eventually
 * lands, not bolted onto one route.
 *
 * Privacy: the address is never logged, never echoed in an error, and never
 * placed in a URL. Success and duplicate return the identical response, so the
 * endpoint cannot be used to probe whether an address is on the list.
 *
 * A successful *new* row sends one branded confirmation to the person who
 * joined. It fires only on a genuinely new row — the `RETURNING` clause below
 * is what makes that true — so a repeat signup can never be used to flood us,
 * and the mail is best-effort: a provider outage must never cost us a signup
 * we have already stored.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_FILL_MS = 1_500;
const RATE_LIMIT = { windowMs: 60_000, max: 5 };

const VALID_SOURCES = new Set([
  "home",
  "cloud",
  "footer",
  "nav",
  "report",
  "commands",
  "engine",
  "modes",
]);

const REPLY_TO = process.env.WAITLIST_REPLY_TO ?? "waitlist@normascope.com";
const CONFIRMATION_FROM = process.env.WAITLIST_CONFIRM_FROM ?? "Normascope <waitlist@normascope.com>";

/**
 * Resend over plain HTTPS so the route keeps its zero-dependency footprint.
 * With `RESEND_API_KEY` unset, local dev and previews do not send mail.
 */
async function sendConfirmation(email: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: CONFIRMATION_FROM,
      to: [email],
      reply_to: REPLY_TO,
      subject: WAITLIST_CONFIRMATION_SUBJECT,
      html: waitlistConfirmationHtml(),
      text: WAITLIST_CONFIRMATION_TEXT,
    }),
  });

  if (!res.ok) throw new Error(`confirmation failed with ${res.status}`);
}

const buckets = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(ip);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
    // Opportunistic sweep; the map is bounded by traffic to one instance.
    if (buckets.size > 10_000) {
      for (const [key, value] of buckets) {
        if (now > value.resetAt) buckets.delete(key);
      }
    }
    return false;
  }

  bucket.count += 1;
  return bucket.count > RATE_LIMIT.max;
}

function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

/**
 * Same body for every non-error outcome — accepted, duplicate, honeypot.
 *
 * Must build a fresh Response per call: a response body is a single-use
 * stream, so a shared module-level instance serves an empty body to every
 * request after the first.
 */
const accepted = () => NextResponse.json({ ok: true });

export async function POST(req: Request) {
  if (rateLimited(clientIp(req))) {
    return NextResponse.json({ ok: false, error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const { email, source, referrer, website, startedAt } = (body ?? {}) as Record<string, unknown>;

  // Honeypot: a real browser leaves this hidden field empty. Answer 200 so a
  // bot cannot distinguish rejection from success and retry with a tweak.
  if (typeof website === "string" && website.length > 0) {
    return accepted();
  }

  // Anything submitted faster than a human can type an address is automation.
  if (typeof startedAt === "number" && Number.isFinite(startedAt)) {
    if (Date.now() - startedAt < MIN_FILL_MS) return accepted();
  }

  // A non-string is the same mistake as an empty box from the server's point of
  // view — a caller that sent no usable address — so it gets the same sentence.
  const problem = typeof email === "string" ? emailProblem(email) : "empty";
  if (problem) {
    return NextResponse.json({ ok: false, error: EMAIL_MESSAGE[problem] }, { status: 400 });
  }

  const normalised = normaliseEmail(email as string);

  const cleanSource = typeof source === "string" && VALID_SOURCES.has(source) ? source : null;
  // Origin only — a full referrer can carry a query string, and query strings
  // carry other people's personal data.
  let cleanReferrer: string | null = null;
  if (typeof referrer === "string" && referrer.length > 0) {
    try {
      cleanReferrer = new URL(referrer).origin.slice(0, 200);
    } catch {
      cleanReferrer = null;
    }
  }

  // `RETURNING id` is what separates a new signup from a repeat one: on
  // conflict the insert does nothing and no row comes back. That single fact
  // drives the notification, so nobody can mail-bomb us by resubmitting.
  let isNew: boolean;
  try {
    const db = await getDb();
    const result = await db.query<{ id: string }>(
      `INSERT INTO waitlist (email, source, referrer) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [normalised, cleanSource, cleanReferrer]
    );
    isNew = result.rows.length > 0;
  } catch (err) {
    // Never surface the database error or the address *to the visitor* — but
    // do log the error itself. This used to be a bare `catch {}`, which meant
    // the first production failure (a database the deployment could not reach)
    // produced a 500 with no trace anywhere: the signup path was down and the
    // only evidence was the visitor's error message. The address is not
    // logged; the driver's message is not personal data.
    console.error("waitlist insert failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { ok: false, error: "Couldn't save that right now. Please try again." },
      { status: 500 }
    );
  }

  if (isNew) {
    try {
      await sendConfirmation(normalised);
    } catch (err) {
      // The row is already committed, so a provider outage must not read to a
      // visitor as "try again". The address is not logged.
      console.error("waitlist confirmation failed:", err instanceof Error ? err.message : String(err));
    }
  }

  return NextResponse.json({ ok: true });
}
