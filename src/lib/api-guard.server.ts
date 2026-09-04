/**
 * Guards for the two public AI endpoints (`/api/commentary`, `/api/scenario`).
 *
 * Both routes proxy the Lovable AI gateway with a server-side key and require
 * no authentication, because this template must work on first open with zero
 * setup. That means a published remix has two endpoints any visitor can call,
 * and every call spends the remixer's AI credits.
 *
 * These guards are the cheap, no-provisioning mitigations: they stop casual
 * abuse (curl loops, oversized prompts) without adding auth, a database, or a
 * third-party challenge. They are deliberately not a defence against a
 * determined attacker — see AGENTS.md, "Open endpoints", for what a remixer
 * should add before putting real spend behind this.
 */

/** Requests per window, per client, per route. */
const LIMIT = 10;
const WINDOW_MS = 60_000;
/** Bound the map so a spray of unique IPs cannot grow it without limit. */
const MAX_TRACKED = 5_000;

const hits = new Map<string, number[]>();

function clientKey(request: Request) {
  const h = request.headers;
  return (
    h.get("cf-connecting-ip") ??
    h.get("x-real-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

/**
 * Fixed-cost sliding window held in module memory. Worker instances are not
 * shared, so this is per-instance rather than global — enough to blunt a loop
 * from one client, not a distributed one.
 */
export function rateLimit(request: Request, route: string): Response | null {
  const now = Date.now();
  const key = `${route}:${clientKey(request)}`;
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) {
    return new Response("Too many requests — try again in a minute.", {
      status: 429,
      headers: { "Retry-After": "60" },
    });
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > MAX_TRACKED) {
    for (const [k, times] of hits) {
      if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
      if (hits.size <= MAX_TRACKED) break;
    }
  }
  return null;
}

/**
 * Reject requests that did not come from the app's own pages. Origin and
 * Referer are trivially forged, so this only removes drive-by traffic; a
 * missing header is allowed through so same-origin fetches from older or
 * privacy-hardened browsers keep working.
 */
export function sameOrigin(request: Request): Response | null {
  const source = request.headers.get("origin") ?? request.headers.get("referer");
  if (!source) return null;
  try {
    if (new URL(source).host === new URL(request.url).host) return null;
  } catch {
    // unparseable header; fall through to reject
  }
  return new Response("Cross-origin requests are not accepted.", { status: 403 });
}

/** Both guards, in the order every handler should apply them. */
export function guardPublicAi(request: Request, route: string): Response | null {
  return sameOrigin(request) ?? rateLimit(request, route);
}

/** Cap caller-supplied strings before they are interpolated into a prompt. */
export function clampText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
