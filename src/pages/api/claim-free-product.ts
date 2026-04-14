import type { APIRoute } from "astro";
import { createClient } from "@sanity/client";
import { requireApiSession } from "../../lib/api-session";
import { userOwnsStoreProduct } from "../../lib/user-owns-product";
import { getMissingEnvKeys } from "../../lib/production-env-check";
import { purchaseHashForDigitalProduct } from "../../lib/owned-digital-purchases";
import {
    checkRateLimit,
    checkRateLimitForUser,
    RATE_LIMITS,
    resolveVisupairKv,
    tooManyRequestsResponse,
} from "../../lib/rate-limit-kv";

const sanityWrite = createClient({
    projectId: "sovnyov1",
    dataset: "production",
    useCdn: false,
    apiVersion: "2024-03-01",
    token: import.meta.env.SANITY_API_TOKEN,
});

const PRODUCT_CLAIM_FIELDS = `*[_id == $id && _type == "product"][0]{
  _id,
  name,
  productType,
  isFree,
  department,
  digitalFileKey
}`;

function claimPaymentId(productId: string, emailNormalized: string): string {
    const safe = emailNormalized.replace(/[^a-z0-9]+/g, "_").slice(0, 120);
    return `free_claim_${productId}_${safe}`;
}

export const POST: APIRoute = async (context) => {
    const missing = getMissingEnvKeys(["SANITY_API_TOKEN"] as const);
    if (missing.length > 0) {
        return new Response(
            JSON.stringify({
                error:
                    import.meta.env.DEV
                        ? `Missing environment variables: ${missing.join(", ")}`
                        : "Server configuration error.",
            }),
            { status: 503, headers: { "Content-Type": "application/json" } },
        );
    }

    const authResult = await requireApiSession(context);
    if ("response" in authResult) {
        return authResult.response;
    }
    const { user } = authResult;
    const email = user.email.trim().toLowerCase();

    const kv = await resolveVisupairKv(context);
    const rlIp = await checkRateLimit(
        kv,
        context.request,
        RATE_LIMITS.claimFreeProduct,
    );
    if (!rlIp.ok) {
        return tooManyRequestsResponse(rlIp.retryAfterSeconds);
    }
    const rlUser = await checkRateLimitForUser(
        kv,
        email,
        RATE_LIMITS.claimFreeProductUser,
    );
    if (!rlUser.ok) {
        return tooManyRequestsResponse(rlUser.retryAfterSeconds);
    }

    let body: { productId?: string };
    try {
        body = await context.request.json();
    } catch {
        return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }

    const productId = String(body.productId || "").trim();
    if (!productId) {
        return new Response(JSON.stringify({ error: "productId is required." }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }

    const doc = await sanityWrite.fetch(PRODUCT_CLAIM_FIELDS, { id: productId });
    if (!doc || !doc._id) {
        return new Response(JSON.stringify({ error: "Product not found." }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
        });
    }

    if (doc.productType !== "digital" || doc.isFree !== true) {
        return new Response(JSON.stringify({ error: "This product is not available as a free claim." }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }

    const dept = doc.department;
    if (dept !== "fashion" && dept !== "3d-models") {
        return new Response(JSON.stringify({ error: "Free claims are only available for Garments or 3D Models." }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }

    const key = doc.digitalFileKey;
    if (!key || String(key).trim() === "") {
        return new Response(JSON.stringify({ error: "This product has no downloadable file configured." }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }

    if (await userOwnsStoreProduct(sanityWrite, email, productId)) {
        const purchaseHash =
            (await purchaseHashForDigitalProduct(
                sanityWrite,
                email,
                productId,
            )) ?? undefined;
        return new Response(
            JSON.stringify({ ok: true, alreadyOwned: true, purchaseHash }),
            {
                status: 200,
                headers: { "Content-Type": "application/json" },
            },
        );
    }

    const stripePaymentIntentId = claimPaymentId(productId, email);

    const existing = await sanityWrite.fetch<{ _id: string } | null>(
        `*[_type == "order" && stripePaymentIntentId == $pid][0]{ _id }`,
        { pid: stripePaymentIntentId },
    );
    if (existing?._id) {
        const purchaseHash =
            (await purchaseHashForDigitalProduct(
                sanityWrite,
                email,
                productId,
            )) ?? undefined;
        return new Response(
            JSON.stringify({ ok: true, alreadyOwned: true, purchaseHash }),
            {
                status: 200,
                headers: { "Content-Type": "application/json" },
            },
        );
    }

    const customerName = (user.name && String(user.name).trim()) || "";
    const lineKey = crypto.randomUUID();

    const sanityOrder: Record<string, unknown> = {
        _type: "order",
        createdAt: new Date().toISOString(),
        orderNumber: stripePaymentIntentId,
        orderType: "digital",
        status: "paid",
        shippingTimelineStage: "confirmed",
        customerEmail: email,
        customerName,
        items: [
            {
                _key: lineKey,
                product: { _type: "reference", _ref: productId },
                productType: "digital",
                quantity: 1,
                price: 0,
                variant: String(doc.name || ""),
            },
        ],
        totalAmount: 0,
        currency: "PLN",
        stripePaymentIntentId,
    };

    try {
        const created = await sanityWrite.create(sanityOrder);
        const orderId =
            created &&
            typeof created === "object" &&
            "_id" in created &&
            typeof (created as { _id: unknown })._id === "string"
                ? (created as { _id: string })._id
                : null;
        const purchaseHash =
            orderId != null
                ? `#purchase-line-${orderId}-${lineKey}`
                : undefined;
        return new Response(
            JSON.stringify({
                ok: true,
                alreadyOwned: false,
                purchaseHash,
            }),
            {
                status: 200,
                headers: { "Content-Type": "application/json" },
            },
        );
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/document already exists|duplicate|already exist/i.test(msg)) {
            const purchaseHash =
                (await purchaseHashForDigitalProduct(
                    sanityWrite,
                    email,
                    productId,
                )) ?? undefined;
            return new Response(
                JSON.stringify({ ok: true, alreadyOwned: true, purchaseHash }),
                {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                },
            );
        }
        console.error("claim-free-product Sanity create:", e);
        return new Response(JSON.stringify({ error: "Could not complete claim. Try again shortly." }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};
