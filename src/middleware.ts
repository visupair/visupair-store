// Astro middleware: currency detection + session resolution + preview mode
// NOTE: This only runs for SSR pages, not for prerendered static pages
import { defineMiddleware } from 'astro:middleware';
import { detectCurrencyFromRequest } from './lib/server-currency';
import { createAuth } from './lib/auth';

// ── Cache cloudflare env import at module level (resolves once, reused across requests) ──
let _cfEnvCache: Record<string, any> | null = null;
let _cfEnvPromise: Promise<Record<string, any>> | null = null;

async function getCfEnv(): Promise<Record<string, any>> {
    if (_cfEnvCache) return _cfEnvCache;
    if (_cfEnvPromise) return _cfEnvPromise;

    _cfEnvPromise = Promise.race([
        // @ts-ignore - cloudflare:workers module
        import("cloudflare:workers")
            .then((mod: any) => mod.env ?? {})
            .catch(() => ({})),
        // Timeout: don't let the import hang the request
        new Promise<Record<string, any>>((resolve) => setTimeout(() => resolve({}), 3000)),
    ]).then((env) => {
        _cfEnvCache = env;
        _cfEnvPromise = null;
        return env;
    });

    return _cfEnvPromise;
}

export const onRequest = defineMiddleware(async (context, next) => {
    // Initialize locals with safe defaults
    context.locals.currency = undefined;
    context.locals.user = null;
    context.locals.session = null;

    // Skip processing for static assets and prerendered pages
    const pathname = new URL(context.request.url).pathname;

    // List of paths that should be static (skip middleware)
    const staticPaths = ['/', '/about'];
    const isStaticPath = staticPaths.some(path => pathname === path || pathname.startsWith(path + '/'));

    if (isStaticPath) {
        // For static pages, just continue without processing
        return next();
    }

    // Skip auth API routes — no session check needed, and prevents circular
    // internal fetches inside Miniflare when a sign-in/sign-up request is made.
    const isAuthApiRoute = pathname.startsWith('/api/auth');
    if (isAuthApiRoute) {
        return next();
    }

    // ── 1. Currency detection (Cloudflare CF-IPCountry header) ──────────
    try {
        const currency = detectCurrencyFromRequest(context.request);
        context.locals.currency = currency;
    } catch {
        // Failed to detect currency (might be prerendered), use default
        context.locals.currency = undefined;
    }

    // ── 2. Session resolution via Better Auth ────────────────────────────
    try {
        const cfEnv = await getCfEnv();
        let dbBinding = cfEnv?.visupair_store;
        let runtimeEnv = cfEnv || {};

        try {
            if (!dbBinding && context.locals.runtime && typeof context.locals.runtime === 'object') {
                const descriptor = Object.getOwnPropertyDescriptor(context.locals.runtime, 'env');
                if (descriptor && typeof descriptor.get !== 'function') {
                    dbBinding = (context.locals.runtime as any).env?.visupair_store;
                    runtimeEnv = (context.locals.runtime as any).env || {};
                }
            }
        } catch (e) { }

        if (dbBinding) {
            const env = {
                ...import.meta.env,
                ...runtimeEnv,
            };
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
        // Session check failure is non-fatal
    }

    // ── 3. Continue to page ──────────────────────────────────────────────
    const response = await next();

    if (context.locals.currency) {
        response.headers.set('X-Detected-Currency', context.locals.currency);
    }

    return response;
});
