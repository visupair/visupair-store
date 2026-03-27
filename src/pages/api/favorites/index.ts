import type { APIRoute } from "astro";
import { createAuth } from "../../../lib/auth";
import { user, favorite } from "../../../lib/auth-schema";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";

export const GET: APIRoute = async (context) => {
    const { request, locals } = context;

    // Access runtime env for D1 binding
    // @ts-ignore
    const { env: cfEnv } = await import("cloudflare:workers").catch(() => ({ env: {} }));
    let dbBinding = cfEnv?.visupair_store as D1Database;
    let env = cfEnv as unknown as Record<string, string>;

    try {
        if (!dbBinding && locals.runtime && typeof locals.runtime === 'object') {
            const descriptor = Object.getOwnPropertyDescriptor(locals.runtime, 'env');
            if (descriptor && typeof descriptor.get !== 'function') {
                dbBinding = (locals.runtime as any).env?.visupair_store as D1Database;
                env = (locals.runtime as any).env as unknown as Record<string, string>;
            }
        }
    } catch (e) { }

    if (!dbBinding) {
        // Return empty if DB not available (e.g. static build or dev mode issue)
        // But for API endpoint 500 might be better if we expect it to work
        return new Response(JSON.stringify({ error: "Database binding not found" }), { status: 500 });
    }

    const auth = createAuth(dbBinding, env);
    const db = drizzle(dbBinding, { schema: { user, favorite } });

    // Get session
    const session = await auth.api.getSession({
        headers: request.headers
    });

    if (!session?.user) {
        // Return empty list if not logged in
        return new Response(JSON.stringify([]), { status: 200 });
    }

    try {
        const favorites = await db.select({ productId: favorite.productId }).from(favorite).where(
            eq(favorite.userId, session.user.id)
        );

        const productIds = favorites.map(f => f.productId);

        return new Response(JSON.stringify(productIds), { status: 200 });

    } catch (error) {
        console.error("Error fetching favorites:", error);
        return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
    }
};
