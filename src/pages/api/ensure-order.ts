import type { APIRoute } from "astro";
import Stripe from "stripe";
import { createClient } from "@sanity/client";

/**
 * POST /api/ensure-order
 *
 * Safety-net endpoint: given a Stripe sessionId, ensures the
 * corresponding order exists in Sanity. If the webhook already
 * created it, returns early. Otherwise creates it from the
 * Stripe session data.
 *
 * Called from the checkout success page (server-side).
 * Kept as a standalone API for potential future use.
 */

const sanity = createClient({
    projectId: "sovnyov1",
    dataset: "production",
    useCdn: false,
    apiVersion: "2024-03-01",
    token: import.meta.env.SANITY_API_TOKEN,
});

export const POST: APIRoute = async (context) => {
    try {
        const body = await context.request.json();
        const { sessionId } = body;

        if (!sessionId) {
            return jsonRes({ error: "Missing sessionId" }, 400);
        }

        const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY);

        const session = await stripe.checkout.sessions.retrieve(sessionId, {
            expand: ["line_items"],
        });

        if (!session || session.payment_status !== "paid") {
            return jsonRes({ error: "Session not paid" }, 400);
        }

        const pid = session.payment_intent?.toString() || session.id;

        const existing = await sanity.fetch(
            `*[_type == "order" && stripePaymentIntentId == $pid][0]{ _id }`,
            { pid },
        );

        if (existing) {
            return jsonRes({ status: "exists", orderId: existing._id });
        }

        // Build order (matches simplified schema)
        const meta = session.metadata || {};
        const isCart = meta.checkoutType === "cart";

        let shippingAddress = null;
        if (meta.shippingName || meta.shippingStreet || meta.shippingCity) {
            shippingAddress = {
                name: meta.shippingName || session.customer_details?.name || "",
                street: meta.shippingStreet || "",
                city: meta.shippingCity || "",
                zip: meta.shippingZip || "",
                country: meta.shippingCountry || "",
            };
        }

        let orderItems: any[] = [];
        let orderType = meta.orderType || meta.productType || "physical";

        if (isCart && meta.cartItems) {
            try {
                const cartItems = JSON.parse(meta.cartItems);
                orderItems = cartItems.map((item: any) => ({
                    _key: crypto.randomUUID(),
                    product: item.id ? { _type: "reference", _ref: item.id } : undefined,
                    productType: item.type || "physical",
                    quantity: item.qty || 1,
                    price: item.price || 0,
                    variant: item.size ? `Size: ${item.size}` : item.name || "",
                }));
            } catch { /* ignore */ }
        }

        if (orderItems.length === 0 && session.line_items?.data) {
            orderItems = session.line_items.data
                .filter((li) => li.description !== "Shipping")
                .map((li) => ({
                    _key: crypto.randomUUID(),
                    product: meta.productId ? { _type: "reference", _ref: meta.productId } : undefined,
                    productType: meta.productType || "physical",
                    quantity: li.quantity || 1,
                    price: (li.amount_total || 0) / 100,
                    variant: li.description || "",
                }));
        }

        let customerName = session.customer_details?.name || "";
        if (meta.firstName) {
            const combined = [meta.firstName, meta.lastName].filter(Boolean).join(" ").trim();
            if (combined) customerName = combined;
        }

        const order: any = {
            _type: "order",
            createdAt: new Date().toISOString(),
            orderNumber: pid,
            orderType,
            status: "paid",
            shippingTimelineStage: "confirmed",
            totalAmount: (session.amount_total || 0) / 100,
            customerName,
            customerEmail: (
                meta.userEmail ||
                session.customer_details?.email ||
                (session as any).customer_email ||
                ""
            ).trim(),
            items: orderItems,
            stripePaymentIntentId: pid,
        };

        if (shippingAddress) order.shippingAddress = shippingAddress;
        if (meta.selectedShippingLabel) order.selectedCourier = meta.selectedShippingLabel;

        const result = await sanity.create(order);
        console.log("📦 [ensure-order] Created order:", result._id);

        return jsonRes({ status: "created", orderId: result._id });
    } catch (err: any) {
        console.error("[ensure-order] Error:", err);
        return jsonRes({ error: "Failed to verify order" }, 500);
    }
};

function jsonRes(data: any, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}
