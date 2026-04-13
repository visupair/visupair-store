import type { APIRoute } from "astro";
import { authClient } from "../../../lib/auth-client";
import { createClient } from "@sanity/client";
import {
    checkFreeDigitalDownloadMonthlyLimit,
    FREE_DIGITAL_DOWNLOADS_PER_MONTH,
    resolveVisupairKv,
} from "../../../lib/rate-limit-kv";

// Use a read-capable client (with token to bypass CDN caching)
const sanityClient = createClient({
    projectId: "sovnyov1",
    dataset: "production",
    useCdn: false,
    apiVersion: "2024-03-01",
    token: import.meta.env.SANITY_API_TOKEN,
});

/** Match `digitalFileKey` in GROQ whether the link was encoded or not. */
function normalizeDownloadFileKeyParam(raw: string): string {
    let s = raw.trim();
    try {
        let prev = "";
        for (let i = 0; i < 3 && s !== prev; i++) {
            prev = s;
            s = decodeURIComponent(s);
        }
    } catch {
        /* keep last good s */
    }
    return s.trim();
}

function looksLikeUrlNotR2Key(key: string): boolean {
    return /^https?:\/\//i.test(key) || key.includes("://");
}

export const GET: APIRoute = async ({ params, request, locals }) => {
    const rawKey = params.fileKey;

    if (!rawKey) {
        return new Response("File key missing", { status: 400 });
    }

    const fileKey = normalizeDownloadFileKeyParam(rawKey);

    if (!fileKey) {
        return new Response("File key missing", { status: 400 });
    }

    if (looksLikeUrlNotR2Key(fileKey)) {
        return new Response(
            JSON.stringify({
                error:
                    "This file is misconfigured: digitalFileKey must be the R2 object key (filename in storage), not a browser or Sanity Studio URL. Update the product in Sanity.",
            }),
            {
                status: 400,
                headers: { "Content-Type": "application/json" },
            },
        );
    }

    // 1. Authenticate User
    const session = await authClient.getSession({
        fetchOptions: { headers: request.headers }
    });

    if (!session.data) {
        return new Response("Unauthorized", { status: 401 });
    }

    const emailNorm = session.data.user.email.trim().toLowerCase();

    // 2. Verify access in Sanity — digital *store products* only via paid order line items;
    // course materials via courseRegistration (webhook often creates registration without an order).
    const orderQuery = `*[
        _type == "order" &&
        lower(customerEmail) == $email &&
        status in ["paid", "processing", "shipped", "delivered"] &&
        count(items[
            product->_type == "product" &&
            product->productType == "digital" &&
            product->digitalFileKey == $fileKey
        ]) > 0
    ][0]{ _id }`;

    const courseRegQuery = `*[
        _type == "courseRegistration" &&
        lower(email) == $email &&
        course->digitalFileKey == $fileKey
    ][0]{ _id }`;

    const orderHit = await sanityClient.fetch(orderQuery, {
        email: emailNorm,
        fileKey,
    });

    let authorized = orderHit;

    if (!authorized) {
        authorized = await sanityClient.fetch(courseRegQuery, {
            email: emailNorm,
            fileKey,
        });
    }

    if (!authorized) {
        return new Response("Forbidden: You have not purchased this product.", { status: 403 });
    }

    const productIdsForKey = await sanityClient.fetch<string[]>(
        `*[_type == "product" && productType == "digital" && digitalFileKey == $fileKey]._id`,
        { fileKey },
    );
    if (productIdsForKey && productIdsForKey.length > 1) {
        console.warn(
            `[download] Multiple digital products share digitalFileKey "${fileKey}". Use unique keys per SKU unless intentional. ids=${productIdsForKey.join(",")}`,
        );
    }

    const fromStoreOrder = Boolean(orderHit);

    const productForFile = await sanityClient.fetch<{
        _id: string;
        isFree?: boolean;
        price?: number;
    } | null>(
        `*[_type == "product" && productType == "digital" && digitalFileKey == $fileKey][0]{ _id, isFree, price }`,
        { fileKey },
    );

    const isFreeTierStoreDigital =
        productForFile != null &&
        (productForFile.isFree === true ||
            (typeof productForFile.price === "number" &&
                Number(productForFile.price) === 0));

    if (isFreeTierStoreDigital && productForFile && fromStoreOrder) {
        const kv = await resolveVisupairKv({ locals });
        const dl = await checkFreeDigitalDownloadMonthlyLimit(
            kv,
            emailNorm,
            productForFile._id,
        );
        if (!dl.ok) {
            return new Response(
                JSON.stringify({
                    error: `Free store downloads are limited to ${FREE_DIGITAL_DOWNLOADS_PER_MONTH} per product per calendar month for your account. Try again next month or contact support if you need help.`,
                }),
                {
                    status: 429,
                    headers: {
                        "Content-Type": "application/json",
                        "Retry-After": String(dl.retryAfterSeconds),
                    },
                },
            );
        }
    }

    // 3. Stream File from Cloudflare R2
    try {
        let runtimeEnv: any = {};
        try {
            if (locals.runtime && typeof locals.runtime === "object") {
                const anyRuntime = locals.runtime as any;
                runtimeEnv = anyRuntime.env || {};
            }
        } catch (_e) { /* not a CF Workers env */ }

        if (!runtimeEnv.VISUPAIR_R2) {
            console.error("R2 binding VISUPAIR_R2 not found in runtime env");
            return new Response("File storage not configured", { status: 503 });
        }

        const object = await runtimeEnv.VISUPAIR_R2.get(fileKey);

        if (!object) {
            return new Response("File not found in storage", { status: 404 });
        }

        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set("etag", object.httpEtag);

        // Force download dialog in browser
        if (!headers.has("content-disposition")) {
            headers.set("content-disposition", `attachment; filename="${fileKey}"`);
        }

        return new Response(object.body, { headers });

    } catch (error) {
        console.error("R2 Error:", error);
        return new Response("Internal Server Error", { status: 500 });
    }
};
