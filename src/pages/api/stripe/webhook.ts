import type { APIRoute } from "astro";
import Stripe from "stripe";
import { sanityClient } from "../../../lib/sanity";

export const POST: APIRoute = async (context) => {
    const signature = context.request.headers.get("stripe-signature");
    const webhookSecret = import.meta.env.STRIPE_WEBHOOK_SECRET;

    if (!signature || !webhookSecret) {
        return new Response("Missing stripe signature or webhook secret", { status: 400 });
    }

    const body = await context.request.text();
    const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY);

    let event: Stripe.Event;

    try {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: any) {
        console.error("Stripe webhook signature verification failed:", err.message);
        return new Response(`Webhook Error: ${err.message}`, { status: 400 });
    }

    try {
        switch (event.type) {
            case "checkout.session.completed": {
                const session = event.data.object as Stripe.Checkout.Session;
                console.log("✅ Payment successful (Stripe):", session.id);

                const metadata = session.metadata || {};
                const productType = metadata.productType || "physical";
                const internalUserEmail = metadata.userEmail;

                let shippingAddress = null;
                const sessionDetails = session as any;
                if (sessionDetails.shipping_details?.address) {
                    const addr = sessionDetails.shipping_details.address;
                    shippingAddress = {
                        name: sessionDetails.shipping_details.name || "",
                        street: addr.line1 || "",
                        city: addr.city || "",
                        zip: addr.postal_code || "",
                        country: addr.country || ""
                    };
                }

                const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
                    limit: 100,
                });

                const orderItems = lineItems.data.map((item) => ({
                    _key: crypto.randomUUID(),
                    productType: productType,
                    quantity: item.quantity || 1,
                    price: (item.amount_total || 0) / 100,
                    variant: item.description || ""
                }));

                const sanityOrder = {
                    _type: "order",
                    orderNumber: session.payment_intent?.toString() || session.id,
                    orderType: productType,
                    status: "paid",
                    customerEmail: internalUserEmail || session.customer_details?.email || "",
                    customerName: session.customer_details?.name || "",
                    items: orderItems,
                    totalAmount: (session.amount_total || 0) / 100,
                    currency: session.currency?.toUpperCase() || "EUR",
                    paymentProvider: "stripe",
                    stripePaymentIntentId: session.payment_intent?.toString() || session.id,
                    ...(shippingAddress ? { shippingAddress } : {})
                };

                const result = await sanityClient.create(sanityOrder);
                console.log("📦 Created Sanity Order:", result._id);
                break;
            }

            default:
                console.log("Unhandled Stripe event type:", event.type);
        }

        return new Response(JSON.stringify({ received: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        console.error("Webhook processing error:", error);
        return new Response("Webhook processing failed", { status: 500 });
    }
};
