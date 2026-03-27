import type { APIRoute } from "astro";
import { authClient } from "../../../lib/auth-client";
import { sanityClient } from "../../../lib/sanity";

export const GET: APIRoute = async ({ params, request, locals }) => {
    const { fileKey } = params;

    if (!fileKey) {
        return new Response("File key missing", { status: 400 });
    }

    // 1. Authenticate User
    const session = await authClient.getSession({
        fetchOptions: {
            headers: request.headers
        }
    });

    if (!session.data) {
        return new Response("Unauthorized", { status: 401 });
    }

    const userEmail = session.data.user.email;

    // 2. Verify Purchase in Sanity
    // Find any PAID order by this user that contains a product/course with this fileKey
    const query = `*[_type == "order" && userEmail == $email && status == "paid" && (
        defined(products[]) && count(products[@->digitalFileKey == $fileKey]) > 0
    )][0]`;

    const order = await sanityClient.fetch(query, { email: userEmail, fileKey });

    if (!order) {
        // Also check if they are the owner/admin (optional, for testing) -> skipped for now
        return new Response("Forbidden: You have not purchased this product.", { status: 403 });
    }

    // 3. Generate Signed URL from R2
    try {
        // @ts-ignore
        const { env: cfEnv } = await import("cloudflare:workers").catch(() => ({ env: {} }));
        let runtimeEnv = cfEnv || {};
        try {
            if (locals.runtime && typeof locals.runtime === 'object') {
                const descriptor = Object.getOwnPropertyDescriptor(locals.runtime, 'env');
                if (descriptor && typeof descriptor.get !== 'function') {
                    runtimeEnv = (locals.runtime as any).env || {};
                }
            }
        } catch (e) { }

        const object = await runtimeEnv.VISUPAIR_R2.get(fileKey);

        if (!object) {
            return new Response("File not found in storage", { status: 404 });
        }

        // R2 Presigned URL requires using the S3 compatible API or a Worker script.
        // Since we are in a Worker (Astro SSR on Cloudflare), we can stream the response 
        // OR easier: just Redirect to a signed URL if we had S3 client.
        // But with native R2 bindings, we can just stream the body!

        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set("etag", object.httpEtag);

        return new Response(object.body, {
            headers,
        });

    } catch (error) {
        console.error("R2 Error:", error);
        return new Response("Internal Server Error", { status: 500 });
    }
};
