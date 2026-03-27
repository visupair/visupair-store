import type { APIRoute } from "astro";
import { createAuth } from "~/lib/auth";
import { review } from "~/lib/auth-schema";
import { randomUUID } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

export const POST: APIRoute = async ({ request, locals }) => {
    try {
        // @ts-ignore
        const { env: cfEnv } = await import("cloudflare:workers").catch(() => ({ env: {} }));
        let dbBinding = cfEnv?.visupair_store;
        let envData = cfEnv || {};

        try {
            if (!dbBinding && locals.runtime && typeof locals.runtime === 'object') {
                const descriptor = Object.getOwnPropertyDescriptor(locals.runtime, 'env');
                if (descriptor && typeof descriptor.get !== 'function') {
                    dbBinding = (locals.runtime as any).env?.visupair_store;
                    envData = (locals.runtime as any).env || {};
                }
            }
        } catch (e) { }

        if (!dbBinding) {
            return new Response(JSON.stringify({ error: "Database not configured" }), { status: 500 });
        }

        const env = {
            BETTER_AUTH_SECRET: envData?.BETTER_AUTH_SECRET,
            BETTER_AUTH_URL: envData?.BETTER_AUTH_URL,
        };
        const auth = createAuth(dbBinding, env as Record<string, string>);
        const session = await auth.api.getSession({ headers: request.headers });

        if (!session) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
        }

        const formData = await request.formData();
        const productId = formData.get("productId") as string;
        const rating = parseInt(formData.get("rating") as string);
        const comment = formData.get("comment") as string;

        if (!productId || isNaN(rating) || rating < 1 || rating > 5) {
            return new Response(JSON.stringify({ error: "Invalid input" }), { status: 400 });
        }

        // Initialize raw Drizzle to access custom table
        const db = drizzle(dbBinding);

        // Check if user already reviewed this product? (Optional: prevent duplicates)
        // For now, let's allow multiple or maybe unique? Let's keep it simple.

        const newReview = {
            id: randomUUID(),
            userId: session.user.id,
            productId,
            rating,
            comment,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        // Use raw query for custom table insertion if schema not picked up by better-auth adapter
        // But since we imported 'review' from schema and verified D1 migration, we can use drizzle insert.
        await db.insert(review).values(newReview);

        return new Response(JSON.stringify({ success: true, review: newReview }), { status: 201 });

    } catch (error) {
        console.error("Review submit error:", error);
        return new Response(JSON.stringify({ error: "Server error" }), { status: 500 });
    }
};
