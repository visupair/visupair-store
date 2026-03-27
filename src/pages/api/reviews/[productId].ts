import type { APIRoute } from "astro";
import { drizzle } from "drizzle-orm/d1";
import { review, user } from "~/lib/auth-schema";
import { eq, desc } from "drizzle-orm";

export const GET: APIRoute = async ({ params, locals }) => {
    const { productId } = params;

    if (!productId) {
        return new Response(JSON.stringify({ error: "Product ID required" }), { status: 400 });
    }

    try {
        // @ts-ignore
        const { env: cfEnv } = await import("cloudflare:workers").catch(() => ({ env: {} }));
        let dbBinding = cfEnv?.visupair_store;

        try {
            if (!dbBinding && locals.runtime && typeof locals.runtime === 'object') {
                const descriptor = Object.getOwnPropertyDescriptor(locals.runtime, 'env');
                if (descriptor && typeof descriptor.get !== 'function') {
                    dbBinding = (locals.runtime as any).env?.visupair_store;
                }
            }
        } catch (e) { }

        if (!dbBinding) {
            // In dev mode without pages running, this might fail if not called via framework
            return new Response(JSON.stringify({ reviews: [], average: 0 }), { status: 200 });
        }

        const db = drizzle(dbBinding);

        // Join with user table to get reviewer name/image
        const reviews = await db.select({
            id: review.id,
            rating: review.rating,
            comment: review.comment,
            createdAt: review.createdAt,
            userName: user.name,
            userImage: user.image,
        })
            .from(review)
            .leftJoin(user, eq(review.userId, user.id))
            .where(eq(review.productId, productId))
            .orderBy(desc(review.createdAt));

        // Calculate average
        const total = reviews.reduce((acc, r) => acc + r.rating, 0);
        const average = reviews.length > 0 ? total / reviews.length : 0;

        return new Response(JSON.stringify({ reviews, average }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });

    } catch (error) {
        console.error("Fetch reviews error:", error);
        return new Response(JSON.stringify({ error: "Failed to fetch reviews" }), { status: 500 });
    }
};
