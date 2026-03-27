import type { APIRoute } from "astro";
import { createAuth } from "../../../lib/auth";
import { drizzle } from "drizzle-orm/d1";
import { review } from "../../../lib/auth-schema";
import { eq, and } from "drizzle-orm";

export const DELETE: APIRoute = async ({ params, request, locals }) => {
    const reviewId = params.id;
    if (!reviewId) {
        return new Response(JSON.stringify({ error: "Review ID required" }), { status: 400 });
    }

    // @ts-ignore
    const { env: cfEnv } = await import("cloudflare:workers").catch(() => ({ env: {} }));
    let dbBinding = cfEnv?.visupair_store;
    let env = cfEnv || {};

    try {
        if (!dbBinding && locals.runtime && typeof locals.runtime === 'object') {
            const descriptor = Object.getOwnPropertyDescriptor(locals.runtime, 'env');
            if (descriptor && typeof descriptor.get !== 'function') {
                dbBinding = (locals.runtime as any).env?.visupair_store;
                env = (locals.runtime as any).env || {};
            }
        }
    } catch (e) { }

    if (!dbBinding) {
        return new Response(JSON.stringify({ error: "Database error" }), { status: 500 });
    }

    const auth = createAuth(dbBinding, env as any);
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session || !session.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const ADMIN_EMAILS = ["visupair@gmail.com"];
    const isAdmin = ADMIN_EMAILS.includes(session.user.email);

    try {
        const db = drizzle(dbBinding);

        let deleteQuery;
        if (isAdmin) {
            // Admin can delete any review by ID
            deleteQuery = db
                .delete(review)
                .where(eq(review.id, reviewId));
        } else {
            // Regular user can only delete their own review
            deleteQuery = db
                .delete(review)
                .where(
                    and(
                        eq(review.id, reviewId),
                        eq(review.userId, session.user.id)
                    )
                );
        }

        const result = await deleteQuery.returning({ id: review.id });

        if (!result || result.length === 0) {
            // Either review didn't exist, or user didn't own it
            // We can check existence if we want specific error messages, trying generic first
            return new Response(JSON.stringify({ error: "Review not found or not authorized" }), { status: 404 });
        }

        return new Response(JSON.stringify({ success: true }), { status: 200 });

    } catch (error) {
        console.error("Delete review error:", error);
        return new Response(JSON.stringify({ error: "Failed to delete review" }), { status: 500 });
    }
};
