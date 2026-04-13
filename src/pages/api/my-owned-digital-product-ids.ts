import type { APIRoute } from "astro";
import { createClient } from "@sanity/client";
import { requireApiSession } from "../../lib/api-session";
import { fetchOwnedDigitalPurchaseMap } from "../../lib/owned-digital-purchases";

const sanityRead = createClient({
    projectId: "sovnyov1",
    dataset: "production",
    useCdn: false,
    apiVersion: "2024-03-01",
});

/**
 * Product Sanity `_id` values the signed-in user owns via a digital line on a completed store order,
 * plus URL hashes to scroll to the matching card on `/account/purchases`.
 */
export const GET: APIRoute = async (context) => {
    const authResult = await requireApiSession(context);
    if ("response" in authResult) {
        return authResult.response;
    }
    const email = authResult.user.email.trim().toLowerCase();

    const { productIds, purchaseHashByProductId } =
        await fetchOwnedDigitalPurchaseMap(sanityRead, email);

    return new Response(
        JSON.stringify({ productIds, purchaseHashByProductId }),
        {
            status: 200,
            headers: { "Content-Type": "application/json" },
        },
    );
};
