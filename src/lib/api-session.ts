import type { APIContext } from "astro";
import { createAuth } from "./auth";

export type ApiSessionUser = {
    id: string;
    email: string;
    name?: string | null;
};

/**
 * Resolves D1 + env the same way as `/api/auth/[...all]` and other authenticated API routes.
 * Returns the signed-in user from the session cookie, or a JSON 401/500 Response.
 */
export async function requireApiSession(
    context: APIContext,
): Promise<{ user: ApiSessionUser } | { response: Response }> {
    const { request, locals } = context;

    // @ts-ignore — cloudflare:workers
    const { env: cfEnv } = await import("cloudflare:workers").catch(() => ({ env: {} }));
    let dbBinding = cfEnv?.visupair_store as D1Database | undefined;
    let runtimeEnv = (cfEnv || {}) as Record<string, string | undefined>;

    try {
        if (!dbBinding && locals.runtime && typeof locals.runtime === "object") {
            const descriptor = Object.getOwnPropertyDescriptor(locals.runtime, "env");
            if (descriptor && typeof descriptor.get !== "function") {
                dbBinding = (locals.runtime as { env?: { visupair_store?: D1Database } }).env
                    ?.visupair_store;
                runtimeEnv = {
                    ...(locals.runtime as { env?: Record<string, string> }).env,
                };
            }
        }
    } catch {
        /* ignore */
    }

    if (!dbBinding) {
        return {
            response: new Response(
                JSON.stringify({ error: "Authentication is not available on this server." }),
                { status: 503, headers: { "Content-Type": "application/json" } },
            ),
        };
    }

    const env = {
        ...import.meta.env,
        ...runtimeEnv,
    } as Record<string, string>;

    let auth: ReturnType<typeof createAuth>;
    try {
        auth = createAuth(dbBinding, env);
    } catch (e) {
        console.error("createAuth failed in requireApiSession:", e);
        return {
            response: new Response(JSON.stringify({ error: "Server configuration error." }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            }),
        };
    }

    const session = await auth.api.getSession({ headers: request.headers });
    const email = session?.user?.email?.trim();
    if (!session?.user?.id || !email) {
        return {
            response: new Response(
                JSON.stringify({ error: "Sign in required to continue to checkout." }),
                { status: 401, headers: { "Content-Type": "application/json" } },
            ),
        };
    }

    return {
        user: {
            id: session.user.id,
            email,
            name: session.user.name,
        },
    };
}

/**
 * Same session cookie as `requireApiSession`, but returns null when the user is not signed in
 * (or auth is unavailable). For optional authenticated API enhancements (e.g. server-built parcel).
 */
export async function getApiSessionUserIfPresent(
    context: APIContext,
): Promise<ApiSessionUser | null> {
    const { request, locals } = context;

    // @ts-ignore — cloudflare:workers
    const { env: cfEnv } = await import("cloudflare:workers").catch(() => ({ env: {} }));
    let dbBinding = cfEnv?.visupair_store as D1Database | undefined;
    let runtimeEnv = (cfEnv || {}) as Record<string, string | undefined>;

    try {
        if (!dbBinding && locals.runtime && typeof locals.runtime === "object") {
            const descriptor = Object.getOwnPropertyDescriptor(locals.runtime, "env");
            if (descriptor && typeof descriptor.get !== "function") {
                dbBinding = (locals.runtime as { env?: { visupair_store?: D1Database } }).env
                    ?.visupair_store;
                runtimeEnv = {
                    ...(locals.runtime as { env?: Record<string, string> }).env,
                };
            }
        }
    } catch {
        /* ignore */
    }

    if (!dbBinding) {
        return null;
    }

    const env = {
        ...import.meta.env,
        ...runtimeEnv,
    } as Record<string, string>;

    let auth: ReturnType<typeof createAuth>;
    try {
        auth = createAuth(dbBinding, env);
    } catch {
        return null;
    }

    const session = await auth.api.getSession({ headers: request.headers });
    const email = session?.user?.email?.trim();
    if (!session?.user?.id || !email) {
        return null;
    }

    return {
        id: session.user.id,
        email,
        name: session.user.name,
    };
}
