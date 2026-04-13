import type { APIContext } from "astro";
import { createAuth } from "./auth";

export type ApiSessionUser = {
    id: string;
    email: string;
    name?: string | null;
};

export type RequireApiSessionOptions = {
    /** Shown when the session cookie is missing or invalid (default: generic sign-in message). */
    unauthorizedMessage?: string;
};

type ResolvedAuthContext =
    | { ok: true; dbBinding: D1Database; runtimeEnv: Record<string, string | undefined> }
    | { ok: false; reason: "no-db" };

async function resolveAuthContext(context: APIContext): Promise<ResolvedAuthContext> {
    const { locals } = context;

    // @ts-ignore — cloudflare:workers
    const { env: cfEnv } = await import("cloudflare:workers").catch(() => ({ env: {} }));
    let dbBinding = cfEnv?.visupair_store as D1Database | undefined;
    let runtimeEnv = (cfEnv || {}) as Record<string, string | undefined>;

    try {
        if (!dbBinding && locals.runtime && typeof locals.runtime === "object") {
            const descriptor = Object.getOwnPropertyDescriptor(locals.runtime, "env");
            if (descriptor && typeof descriptor.get !== "function") {
                const rtEnv = (locals.runtime as { env?: unknown }).env as
                    | { visupair_store?: D1Database }
                    | undefined;
                dbBinding = rtEnv?.visupair_store;
                runtimeEnv = {
                    ...(rtEnv as Record<string, string | undefined> | undefined),
                };
            }
        }
    } catch {
        /* ignore */
    }

    if (!dbBinding) {
        return { ok: false, reason: "no-db" };
    }
    return { ok: true, dbBinding, runtimeEnv };
}

/**
 * Resolves D1 + env the same way as `/api/auth/[...all]` and other authenticated API routes.
 * Returns the signed-in user from the session cookie, or a JSON 401/500 Response.
 */
export async function requireApiSession(
    context: APIContext,
    options?: RequireApiSessionOptions,
): Promise<{ user: ApiSessionUser } | { response: Response }> {
    const { request } = context;
    const unauthorizedMessage = options?.unauthorizedMessage ?? "Sign in required.";

    const resolved = await resolveAuthContext(context);
    if (!resolved.ok) {
        return {
            response: new Response(
                JSON.stringify({ error: "Authentication is not available on this server." }),
                { status: 503, headers: { "Content-Type": "application/json" } },
            ),
        };
    }

    const { dbBinding, runtimeEnv } = resolved;
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
            response: new Response(JSON.stringify({ error: unauthorizedMessage }), {
                status: 401,
                headers: { "Content-Type": "application/json" },
            }),
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
    const { request } = context;

    const resolved = await resolveAuthContext(context);
    if (!resolved.ok) {
        return null;
    }

    const { dbBinding, runtimeEnv } = resolved;
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
