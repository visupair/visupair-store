import type { APIContext } from "astro";
import { buildTrustedOriginAllowlistSet } from "./trusted-origins";

/**
 * Stripe success/cancel URLs must use an allowed site origin (never a raw client-controlled string).
 * Same allowlist construction as Better Auth trustedOrigins (see trusted-origins.ts).
 */
export function buildCheckoutOriginAllowlist(
    env: Record<string, string | undefined>,
): Set<string> {
    const baseURL =
        env.BETTER_AUTH_URL ||
        process.env.BETTER_AUTH_URL ||
        "https://visupair.com";
    return buildTrustedOriginAllowlistSet(baseURL, env);
}

export async function mergeCheckoutEnvFromContext(
    context: APIContext,
): Promise<Record<string, string | undefined>> {
    const meta = import.meta.env as Record<string, string | undefined>;
    const out: Record<string, string | undefined> = {
        PUBLIC_SITE_URL: meta.PUBLIC_SITE_URL ?? process.env.PUBLIC_SITE_URL,
        BETTER_AUTH_URL: meta.BETTER_AUTH_URL ?? process.env.BETTER_AUTH_URL,
        BETTER_AUTH_TRUSTED_ORIGINS:
            meta.BETTER_AUTH_TRUSTED_ORIGINS ?? process.env.BETTER_AUTH_TRUSTED_ORIGINS,
    };
    try {
        const locals = context.locals;
        if (locals?.runtime && typeof locals.runtime === "object") {
            const descriptor = Object.getOwnPropertyDescriptor(locals.runtime, "env");
            if (descriptor && typeof descriptor.get !== "function") {
                const e = (locals.runtime as unknown as { env?: Record<string, string> }).env;
                if (e) {
                    if (e.PUBLIC_SITE_URL) out.PUBLIC_SITE_URL = e.PUBLIC_SITE_URL;
                    if (e.BETTER_AUTH_URL) out.BETTER_AUTH_URL = e.BETTER_AUTH_URL;
                    if (e.BETTER_AUTH_TRUSTED_ORIGINS) {
                        out.BETTER_AUTH_TRUSTED_ORIGINS = e.BETTER_AUTH_TRUSTED_ORIGINS;
                    }
                }
            }
        }
    } catch {
        /* */
    }
    try {
        // @ts-expect-error — only exists under Cloudflare Workers adapter
        const { env } = await import("cloudflare:workers");
        const e = env as Record<string, string | undefined>;
        if (e?.PUBLIC_SITE_URL) out.PUBLIC_SITE_URL = e.PUBLIC_SITE_URL;
        if (e?.BETTER_AUTH_URL) out.BETTER_AUTH_URL = e.BETTER_AUTH_URL;
        if (e?.BETTER_AUTH_TRUSTED_ORIGINS) {
            out.BETTER_AUTH_TRUSTED_ORIGINS = e.BETTER_AUTH_TRUSTED_ORIGINS;
        }
    } catch {
        /* not on workers */
    }
    return out;
}

/**
 * Stripe success/cancel URLs must use an allowed site origin (never a raw client-controlled string).
 */
export function resolveCheckoutOrigin(
    request: Request,
    allowlist: Set<string>,
): string | null {
    const originHdr = request.headers.get("origin");
    if (originHdr) {
        try {
            const o = new URL(originHdr).origin;
            if (allowlist.has(o)) return o;
        } catch {
            /* */
        }
    }
    const referer = request.headers.get("referer");
    if (referer) {
        try {
            const o = new URL(referer).origin;
            if (allowlist.has(o)) return o;
        } catch {
            /* */
        }
    }
    return null;
}

/**
 * For cancel_url `next=` param: only allow full Referer URL if same allowed origin (avoid open redirects).
 */
export function safeRefererForCancelRedirect(
    refererHeader: string | null,
    siteOrigin: string,
    allowlist: Set<string>,
): string {
    const fallback = `${siteOrigin}/`;
    if (!refererHeader?.trim()) return fallback;
    try {
        const u = new URL(refererHeader);
        if (u.protocol !== "http:" && u.protocol !== "https:") return fallback;
        if (!allowlist.has(u.origin)) return fallback;
        return refererHeader;
    } catch {
        return fallback;
    }
}
