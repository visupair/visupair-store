import type { APIContext } from "astro";

export type RateLimitRule = {
  /** Short identifier for the route (used in KV key) */
  route: string;
  max: number;
  windowSeconds: number;
};

const RL_KEY_PREFIX = "rl:v1";

type DevBucket = { count: number; resetAt: number };
const devStore = new Map<string, DevBucket>();

function getClientIp(request: Request): string {
  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf.trim().slice(0, 64);
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim().slice(0, 64);
  return "unknown";
}

export async function resolveVisupairKv(
  context: Pick<APIContext, "locals">,
): Promise<KVNamespace | undefined> {
  try {
    const locals = context.locals;
    if (locals?.runtime && typeof locals.runtime === "object") {
      const env = (locals.runtime as { env?: { VISUPAIR_KV?: KVNamespace } }).env;
      if (env?.VISUPAIR_KV) return env.VISUPAIR_KV;
    }
  } catch {
    /* ignore */
  }
  try {
    // @ts-expect-error — only exists under Cloudflare Workers adapter
    const { env } = await import("cloudflare:workers");
    return (env as { VISUPAIR_KV?: KVNamespace }).VISUPAIR_KV;
  } catch {
    return undefined;
  }
}

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number };

/**
 * Fixed-window limiter using KV when available; in-memory fallback for local Node dev.
 */
export async function checkRateLimit(
  kv: KVNamespace | undefined,
  request: Request,
  rule: RateLimitRule,
): Promise<RateLimitResult> {
  const ip = getClientIp(request);
  const now = Date.now();
  const windowMs = Math.max(1, rule.windowSeconds) * 1000;
  const bucket = Math.floor(now / windowMs);
  const key = `${RL_KEY_PREFIX}:${rule.route}:${ip}:${bucket}`;

  if (!kv) {
    const devKey = key;
    let b = devStore.get(devKey);
    if (!b || now >= b.resetAt) {
      b = { count: 0, resetAt: now + windowMs };
      devStore.set(devKey, b);
    }
    b.count += 1;
    if (b.count > rule.max) {
      return {
        ok: false,
        retryAfterSeconds: Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
      };
    }
    return { ok: true };
  }

  let raw = await kv.get(key);
  let count = raw ? parseInt(raw, 10) : 0;
  if (!Number.isFinite(count)) count = 0;
  count += 1;

  await kv.put(key, String(count), {
    expirationTtl: Math.max(60, rule.windowSeconds * 2),
  });

  if (count > rule.max) {
    const windowEnd = (bucket + 1) * windowMs;
    const retryAfterSeconds = Math.max(1, Math.ceil((windowEnd - now) / 1000));
    return { ok: false, retryAfterSeconds };
  }

  return { ok: true };
}

export function tooManyRequestsResponse(retryAfterSeconds: number): Response {
  return new Response(
    JSON.stringify({ error: "Too many requests. Please try again later." }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSeconds),
      },
    },
  );
}

/** Preset caps (per IP, fixed window). */
export const RATE_LIMITS = {
  shippingRates: { route: "shipping-rates", max: 30, windowSeconds: 60 },
  restockNotification: { route: "restock", max: 8, windowSeconds: 3600 },
  contact: { route: "contact", max: 15, windowSeconds: 3600 },
  support: { route: "support", max: 15, windowSeconds: 3600 },
  submitProposal: { route: "proposal", max: 8, windowSeconds: 3600 },
  courseRegister: { route: "course-register", max: 15, windowSeconds: 3600 },
  review: { route: "review", max: 15, windowSeconds: 3600 },
} as const satisfies Record<string, RateLimitRule>;
