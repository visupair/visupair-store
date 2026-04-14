import type { APIRoute } from "astro";
import { createClient } from "@sanity/client";
import { mergeAuthEnv } from "~/lib/auth-worker-env";
import { createAuth } from "~/lib/auth";
import { review } from "~/lib/auth-schema";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/d1";
import {
    checkRateLimit,
    RATE_LIMITS,
    resolveVisupairKv,
} from "~/lib/rate-limit-kv";
import { userOwnsStoreProduct } from "~/lib/user-owns-product";

export const POST: APIRoute = async (context) => {
    const { request, locals } = context;
    try {
        const kv = await resolveVisupairKv(context);
        const rl = await checkRateLimit(kv, request, RATE_LIMITS.review);
        if (!rl.ok) {
            return new Response(
                JSON.stringify({ error: "Too many requests. Please try again later." }),
                {
                    status: 429,
                    headers: {
                        "Content-Type": "application/json",
                        "Retry-After": String(rl.retryAfterSeconds),
                    },
                },
            );
        }

        // @ts-ignore
        const { env: cfEnv } = await import("cloudflare:workers").catch(() => ({ env: {} }));
        let dbBinding = cfEnv?.visupair_store;
        let envData = cfEnv || {};

        try {
            if (!dbBinding && locals.runtime && typeof locals.runtime === "object") {
                const descriptor = Object.getOwnPropertyDescriptor(locals.runtime, "env");
                if (descriptor && typeof descriptor.get !== "function") {
                    dbBinding = (locals.runtime as any).env?.visupair_store;
                    envData = (locals.runtime as any).env || {};
                }
            }
        } catch (e) {}

        if (!dbBinding) {
            return new Response(JSON.stringify({ error: "Database not configured" }), { status: 500 });
        }

        const auth = createAuth(
            dbBinding,
            mergeAuthEnv(envData as Record<string, unknown>),
        );
        const session = await auth.api.getSession({ headers: request.headers });

        if (!session?.user?.email?.trim()) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
        }
        const userEmail = session.user.email;

        const formData = await request.formData();
        const productId = String(formData.get("productId") || "").trim();
        const rating = parseInt(String(formData.get("rating") || ""), 10);
        const comment = formData.get("comment") as string;

        if (!productId || Number.isNaN(rating) || rating < 1 || rating > 5) {
            return new Response(JSON.stringify({ error: "Invalid input" }), { status: 400 });
        }

        const sanityRead = createClient({
            projectId: "sovnyov1",
            dataset: "production",
            useCdn: false,
            token: import.meta.env.SANITY_API_TOKEN,
            apiVersion: "2024-03-01",
        });

        const productExists = await sanityRead.fetch<string | null>(
            `*[_type == "product" && _id == $id][0]._id`,
            { id: productId },
        );
        if (!productExists) {
            return new Response(JSON.stringify({ error: "Product not found." }), { status: 404 });
        }

        const owns = await userOwnsStoreProduct(sanityRead, userEmail, productId);
        if (!owns) {
            return new Response(
                JSON.stringify({
                    error: "Only customers who purchased this product can leave a review.",
                }),
                { status: 403 },
            );
        }

        const db = drizzle(dbBinding);

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
