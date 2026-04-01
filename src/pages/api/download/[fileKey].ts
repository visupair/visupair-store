import type { APIRoute } from "astro";
import { authClient } from "../../../lib/auth-client";
import { createClient } from "@sanity/client";

// Use a read-capable client (with token to bypass CDN caching)
const sanityClient = createClient({
    projectId: "sovnyov1",
    dataset: "production",
    useCdn: false,
    apiVersion: "2024-03-01",
    token: import.meta.env.SANITY_API_TOKEN,
});

export const GET: APIRoute = async ({ params, request, locals }) => {
    const { fileKey } = params;

    if (!fileKey) {
        return new Response("File key missing", { status: 400 });
    }

    // 1. Authenticate User
    const session = await authClient.getSession({
        fetchOptions: { headers: request.headers }
    });

    if (!session.data) {
        return new Response("Unauthorized", { status: 401 });
    }

    const userEmail = session.data.user.email;

    // 2. Verify access in Sanity — digital *store products* only via paid order line items;
    // course materials via courseRegistration (webhook often creates registration without an order).
    const orderQuery = `*[
        _type == "order" &&
        customerEmail == $email &&
        status in ["paid", "processing", "shipped", "delivered"] &&
        count(items[
            product->_type == "product" &&
            product->productType == "digital" &&
            product->digitalFileKey == $fileKey
        ]) > 0
    ][0]{ _id }`;

    const courseRegQuery = `*[
        _type == "courseRegistration" &&
        email == $email &&
        course->digitalFileKey == $fileKey
    ][0]{ _id }`;

    let authorized = await sanityClient.fetch(orderQuery, {
        email: userEmail,
        fileKey,
    });

    if (!authorized) {
        authorized = await sanityClient.fetch(courseRegQuery, {
            email: userEmail,
            fileKey,
        });
    }

    if (!authorized) {
        return new Response("Forbidden: You have not purchased this product.", { status: 403 });
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
