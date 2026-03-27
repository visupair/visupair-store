import type { APIRoute } from "astro";
import { createAuth } from "../../../lib/auth";
import { user, favorite } from "../../../lib/auth-schema";
import { drizzle } from "drizzle-orm/d1";
import { eq, and } from "drizzle-orm";

export const POST: APIRoute = async (context) => {
    const { params, request, locals } = context;
    const { productId } = params;

    if (!productId) {
        return new Response(JSON.stringify({ error: "Product ID is required" }), { status: 400 });
    }

    // Access runtime env for D1 binding
    // @ts-ignore
    const { env: cfEnv } = await import("cloudflare:workers").catch(() => ({ env: {} }));
    let dbBinding = cfEnv?.visupair_store as D1Database;
    let env = cfEnv as any;

    try {
        if (!dbBinding && locals.runtime && typeof locals.runtime === 'object') {
            const descriptor = Object.getOwnPropertyDescriptor(locals.runtime, 'env');
            if (descriptor && typeof descriptor.get !== 'function') {
                dbBinding = (locals.runtime as any).env?.visupair_store as D1Database;
                env = (locals.runtime as any).env as any;
            }
        }
    } catch (e) { }

    if (!dbBinding) {
        // Fallback for development if locals.runtime is missing (e.g. ssr mode without adapter active in dev sometimes?)
        // actually better to just error or handle gracefully
        return new Response(JSON.stringify({ error: "Database binding not found" }), { status: 500 });
    }

    const auth = createAuth(dbBinding, env);
    const db = drizzle(dbBinding, { schema: { user, favorite } });

    // Get session
    const session = await auth.api.getSession({
        headers: request.headers
    });

    if (!session?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    try {
        // Check if already favorite
        const existing = await db.select().from(favorite).where(
            and(
                eq(favorite.userId, session.user.id),
                eq(favorite.productId, productId)
            )
        ).get();

        if (existing) {
            return new Response(JSON.stringify({ message: "Already a favorite" }), { status: 200 });
        }

        await db.insert(favorite).values({
            id: crypto.randomUUID(),
            userId: session.user.id,
            productId: productId,
            createdAt: new Date(),
        });

        return new Response(JSON.stringify({ message: "Added to favorites" }), { status: 200 });

    } catch (error) {
        console.error("Error adding favorite:", error);
        return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
    }
};

export const DELETE: APIRoute = async (context) => {
    const { params, request, locals } = context;
    const { productId } = params;

    if (!productId) {
        return new Response(JSON.stringify({ error: "Product ID is required" }), { status: 400 });
    }

    // Access runtime env for D1 binding
    // @ts-ignore
    const { env: cfEnv } = await import("cloudflare:workers").catch(() => ({ env: {} }));
    let dbBinding = cfEnv?.visupair_store as D1Database;
    let env = cfEnv as any;

    try {
        if (!dbBinding && locals.runtime && typeof locals.runtime === 'object') {
            const descriptor = Object.getOwnPropertyDescriptor(locals.runtime, 'env');
            if (descriptor && typeof descriptor.get !== 'function') {
                dbBinding = (locals.runtime as any).env?.visupair_store as D1Database;
                env = (locals.runtime as any).env as any;
            }
        }
    } catch (e) { }

    if (!dbBinding) {
        return new Response(JSON.stringify({ error: "Database binding not found" }), { status: 500 });
    }

    const auth = createAuth(dbBinding, env);
    const db = drizzle(dbBinding, { schema: { user, favorite } });

    // Get session
    const session = await auth.api.getSession({
        headers: request.headers
    });

    if (!session?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    try {
        await db.delete(favorite).where(
            and(
                eq(favorite.userId, session.user.id),
                eq(favorite.productId, productId)
            )
        );

        return new Response(JSON.stringify({ message: "Removed from favorites" }), { status: 200 });

    } catch (error) {
        console.error("Error removing favorite:", error);
        return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
    }
};
