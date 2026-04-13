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

/** Monthly free-digital download counter (dev fallback). */
type FreeDlDevBucket = { count: number; monthKey: string };
const freeDlDevStore = new Map<string, FreeDlDevBucket>();

const FDL_KEY_PREFIX = "fdl:v1";

function djb2Hex(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function utcYearMonth(d: Date): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** Seconds from `now` until end of UTC calendar month (+1s buffer). */
export function secondsUntilUtcMonthEnd(now = Date.now()): number {
  const d = new Date(now);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const startNext = Date.UTC(y, m + 1, 1, 0, 0, 0);
  return Math.max(60, Math.ceil((startNext - now) / 1000));
}

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
      const descriptor = Object.getOwnPropertyDescriptor(locals.runtime, "env");
      if (descriptor && typeof descriptor.get !== "function") {
        const env = (locals.runtime as { env?: { VISUPAIR_KV?: KVNamespace } }).env;
        if (env?.VISUPAIR_KV) return env.VISUPAIR_KV;
      }
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

/**
 * Fixed-window limiter keyed by **user** (e.g. normalized email), not IP.
 */
export async function checkRateLimitForUser(
  kv: KVNamespace | undefined,
  userKey: string,
  rule: RateLimitRule,
): Promise<RateLimitResult> {
  const safe = userKey
    .trim()
    .toLowerCase()
    .slice(0, 320)
    .replace(/[^a-z0-9@._+-]/gi, "_");
  if (!safe) {
    return { ok: true };
  }

  const now = Date.now();
  const windowMs = Math.max(1, rule.windowSeconds) * 1000;
  const bucket = Math.floor(now / windowMs);
  const key = `${RL_KEY_PREFIX}:${rule.route}:u:${safe}:${bucket}`;

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

/**
 * Store free digital SKUs: max `FREE_DIGITAL_DOWNLOADS_PER_MONTH` completed downloads
 * per account per product per **UTC calendar month** (order-based entitlement only).
 */
export const FREE_DIGITAL_DOWNLOADS_PER_MONTH = 2;

export async function checkFreeDigitalDownloadMonthlyLimit(
  kv: KVNamespace | undefined,
  normalizedEmail: string,
  productId: string,
): Promise<RateLimitResult> {
  const email = normalizedEmail.trim().toLowerCase();
  if (!email || !productId) return { ok: true };

  const monthKey = utcYearMonth(new Date());
  const id = djb2Hex(`${email}\0${productId}\0${monthKey}`);
  const key = `${FDL_KEY_PREFIX}:${id}:${monthKey}`;
  const max = FREE_DIGITAL_DOWNLOADS_PER_MONTH;

  if (!kv) {
    const prev = freeDlDevStore.get(key);
    const count = prev?.monthKey === monthKey ? prev.count : 0;
    if (count >= max) {
      return {
        ok: false,
        retryAfterSeconds: secondsUntilUtcMonthEnd(),
      };
    }
    freeDlDevStore.set(key, { count: count + 1, monthKey });
    return { ok: true };
  }

  const raw = await kv.get(key);
  let count = raw ? parseInt(raw, 10) : 0;
  if (!Number.isFinite(count)) count = 0;
  if (count >= max) {
    return {
      ok: false,
      retryAfterSeconds: secondsUntilUtcMonthEnd(),
    };
  }
  count += 1;
  await kv.put(key, String(count), {
    expirationTtl: Math.max(3600, secondsUntilUtcMonthEnd() + 86400),
  });
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
  /** Per IP — burst / abuse protection on free-claim endpoint. */
  claimFreeProduct: { route: "claim-free", max: 40, windowSeconds: 3600 },
  /** Per authenticated user — additional cap on claim attempts. */
  claimFreeProductUser: { route: "claim-free-user", max: 25, windowSeconds: 3600 },
} as const satisfies Record<string, RateLimitRule>;
