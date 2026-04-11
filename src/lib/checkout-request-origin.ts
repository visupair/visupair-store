import type { APIContext } from "astro";

function addOrigin(set: Set<string>, raw: string | undefined) {
    if (!raw?.trim()) return;
    try {
        const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
        set.add(u.origin);
    } catch {
        /* ignore invalid */
    }
}

/**
 * Same origin allowlist idea as better-auth (`src/lib/auth.ts` buildTrustedOrigins):
 * dev localhost ports, PUBLIC_SITE_URL, BETTER_AUTH_URL, BETTER_AUTH_TRUSTED_ORIGINS.
 */
export function buildCheckoutOriginAllowlist(
    env: Record<string, string | undefined>,
): Set<string> {
    const set = new Set<string>();
    const devHosts = ["localhost", "127.0.0.1"];
    const devPorts = ["4321", "8787", "4173", "3000"];
    for (const host of devHosts) {
        for (const port of devPorts) {
            set.add(`http://${host}:${port}`);
        }
    }
    const baseSeed =
        env.BETTER_AUTH_URL ||
        env.PUBLIC_SITE_URL ||
        process.env.BETTER_AUTH_URL ||
        process.env.PUBLIC_SITE_URL ||
        "http://localhost:4321";
    addOrigin(set, baseSeed);
    addOrigin(set, env.PUBLIC_SITE_URL);
    addOrigin(set, env.BETTER_AUTH_URL);
    addOrigin(set, process.env.PUBLIC_SITE_URL);
    addOrigin(set, process.env.BETTER_AUTH_URL);
    const extra =
        env.BETTER_AUTH_TRUSTED_ORIGINS || process.env.BETTER_AUTH_TRUSTED_ORIGINS;
    if (extra) {
        for (const part of extra.split(",")) addOrigin(set, part.trim());
    }
    for (const o of [...set]) {
        try {
            const u = new URL(o);
            const host = u.hostname;
            if (host.startsWith("www.")) {
                set.add(`${u.protocol}//${host.replace(/^www\./, "")}`);
            } else if (
                host !== "localhost" &&
                !host.startsWith("127.") &&
                host.includes(".")
            ) {
                set.add(`${u.protocol}//www.${host}`);
            }
        } catch {
            /* */
        }
    }
    return set;
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
        const locals = context.locals as { runtime?: { env?: Record<string, string> } };
        const e = locals?.runtime?.env;
        if (e) {
            if (e.PUBLIC_SITE_URL) out.PUBLIC_SITE_URL = e.PUBLIC_SITE_URL;
            if (e.BETTER_AUTH_URL) out.BETTER_AUTH_URL = e.BETTER_AUTH_URL;
            if (e.BETTER_AUTH_TRUSTED_ORIGINS) {
                out.BETTER_AUTH_TRUSTED_ORIGINS = e.BETTER_AUTH_TRUSTED_ORIGINS;
            }
        }
    } catch {
        /* */
    }
    try {
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
