// SSR: currency + Better Auth session. See `unwrapAstroMiddlewareSequence` in astro.config.mjs —
// Astro wraps this in `sequence()`, which breaks Cloudflare Workers when there is only one handler.
import type { MiddlewareHandler } from "astro";
import { detectCurrencyFromRequest } from "./lib/server-currency";
import { createAuth } from "./lib/auth";

async function getCloudflareEnv(): Promise<Record<string, unknown>> {
    // @ts-ignore — virtual module in the Workers bundle
    const { env } = await import("cloudflare:workers").catch(() => ({
        env: {} as Record<string, unknown>,
    }));
    return env ?? {};
}

function isResponseLike(value: unknown): value is Response {
    return (
        typeof value === "object" &&
        value !== null &&
        "headers" in value &&
        typeof (value as Response).status === "number"
    );
}

function withCurrencyHeader(
    response: Response,
    currency: string | undefined,
): Response {
    if (!currency) return response;
    const headers = new Headers(response.headers);
    headers.set("X-Detected-Currency", currency);
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

export const onRequest: MiddlewareHandler = async (context, next) => {
    context.locals.currency = undefined;
    context.locals.user = null;
    context.locals.session = null;

    const pathname = new URL(context.request.url).pathname;

    const staticPaths = ["/", "/about"];
    const isStaticPath = staticPaths.some(
        (path) => pathname === path || pathname.startsWith(`${path}/`),
    );

    if (isStaticPath) {
        return next();
    }

    if (pathname.startsWith("/api/auth")) {
        return next();
    }

    try {
        context.locals.currency = detectCurrencyFromRequest(context.request);
    } catch {
        context.locals.currency = undefined;
    }

    try {
        const cfEnv = await getCloudflareEnv();
        const dbBinding = cfEnv.visupair_store as D1Database | undefined;

        if (dbBinding) {
            const env = {
                ...import.meta.env,
                ...cfEnv,
            } as Record<string, string>;
            const auth = createAuth(dbBinding, env);
            const sessionResult = await auth.api.getSession({
                headers: context.request.headers,
            });
            if (sessionResult) {
                context.locals.user = sessionResult.user ?? null;
                context.locals.session = sessionResult.session ?? null;
            }
        }
    } catch {
        /* best-effort */
    }

    const response = await next();

    if (!isResponseLike(response)) {
        return response;
    }

    return withCurrencyHeader(response, context.locals.currency);
};
