/**
 * Store: subscribe in Stripe Dashboard to at least
 * `checkout.session.completed` and `checkout.session.expired`
 * (expired releases inventory reserved when Checkout was opened).
 *
 * Required env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SANITY_API_TOKEN
 * (validated in stripeWebhookEnvGuard). Local checklist: `npm run check:env`.
 */
import type { APIRoute } from "astro";
import Stripe from "stripe";
import { createClient } from "@sanity/client";
import { sendOrderNotification } from "../../../lib/email";
import { ensureCourseRegistrationFromStripeSession } from "../../../lib/ensure-course-registration-from-stripe";
import { decrementPhysicalProductStock } from "../../../lib/decrement-physical-stock";
import { stripeSessionStockWasReserved } from "../../../lib/physical-stock-reservation";
import { releaseInventoryIfHeld } from "../../../lib/checkout-inventory-release";
import { stripeWebhookEnvGuard } from "../../../lib/production-env-check";

const sanityWriteClient = createClient({
    projectId: "sovnyov1",
    dataset: "production",
    useCdn: false,
    apiVersion: "2024-03-01",
    token: import.meta.env.SANITY_API_TOKEN,
});

export const POST: APIRoute = async (context) => {
    const misconfigured = stripeWebhookEnvGuard();
    if (misconfigured) {
        return misconfigured;
    }

    const signature = context.request.headers.get("stripe-signature");
    if (!signature) {
        return new Response("Missing stripe-signature header", { status: 400 });
    }

    const webhookSecret = import.meta.env.STRIPE_WEBHOOK_SECRET as string;
    const body = await context.request.text();
    const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY as string);

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

                const courseOutcome = await ensureCourseRegistrationFromStripeSession(
                    session,
                    sanityWriteClient,
                );
                if (courseOutcome.action === "registered") {
                    console.log("📋 Course registration recorded:", courseOutcome.registrationId);
                    break;
                }
                if (courseOutcome.action === "stop") {
                    console.warn(
                        "⚠️ Course checkout did not create registration:",
                        courseOutcome.reason,
                    );
                    break;
                }

                const metadata = session.metadata || {};
                const internalUserEmail = metadata.userEmail;
                const isCartCheckout = metadata.checkoutType === "cart";

                let shippingAddress = null;
                if (metadata.shippingName || metadata.shippingStreet || metadata.shippingCity) {
                    shippingAddress = {
                        name: metadata.shippingName || "",
                        street: metadata.shippingStreet || "",
                        city: metadata.shippingCity || "",
                        zip: metadata.shippingZip || "",
                        country: metadata.shippingCountry || "",
                    };
                }

                let orderItems: any[] = [];
                let orderType = metadata.orderType || metadata.productType || "physical";
                let selectedCourier = "";
                let shippingAmount = 0;

                if (isCartCheckout && metadata.cartItems) {
                    // Cart checkout: build items from metadata
                    try {
                        const cartItems = JSON.parse(metadata.cartItems);
                        orderItems = cartItems.map((item: any) => ({
                            _key: crypto.randomUUID(),
                            product: item.id ? { _type: "reference", _ref: item.id } : undefined,
                            productType: item.type || "physical",
                            quantity: item.qty || 1,
                            price: item.price || 0,
                            variant: item.size ? `Size: ${item.size}` : item.name || "",
                        }));
                    } catch {
                        console.warn("Failed to parse cartItems metadata, falling back to line items");
                    }

                    selectedCourier = metadata.selectedShippingLabel || "";
                    shippingAmount = parseFloat(metadata.selectedShippingAmount || "0");
                }

                // Fallback: build from Stripe line items if cart parsing failed or single-product checkout
                if (orderItems.length === 0) {
                    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
                    const productType = metadata.productType || "physical";

                    orderItems = lineItems.data
                        .filter((item) => item.description !== "Shipping")
                        .map((item) => ({
                            _key: crypto.randomUUID(),
                            product: metadata.productId ? { _type: "reference", _ref: metadata.productId } : undefined,
                            productType,
                            quantity: item.quantity || 1,
                            price: (item.amount_total || 0) / 100,
                            variant: item.description || "",
                        }));
                }

                let customerName = session.customer_details?.name || "";
                if (metadata.firstName) {
                    const combined = [metadata.firstName, metadata.lastName].filter(Boolean).join(" ").trim();
                    if (combined) customerName = combined;
                }

                const paymentId = session.payment_intent?.toString() || session.id;
                const existingOrder = await sanityWriteClient.fetch(
                    `*[_type == "order" && stripePaymentIntentId == $pid][0]{ _id }`,
                    { pid: paymentId },
                );
                if (existingOrder) {
                    console.log("Order already recorded for payment; skipping duplicate webhook create:", paymentId);
                    break;
                }

                const checkoutCurrency = (session.currency || "pln").toUpperCase();

                const sanityOrder: any = {
                    _type: "order",
                    createdAt: new Date().toISOString(),
                    orderNumber: paymentId,
                    orderType,
                    status: "paid",
                    shippingTimelineStage: "confirmed",
                    customerEmail: (
                        internalUserEmail ||
                        session.customer_details?.email ||
                        (session as any).customer_email ||
                        ""
                    ).trim(),
                    customerName,
                    items: orderItems,
                    totalAmount: (session.amount_total || 0) / 100,
                    currency: checkoutCurrency,
                    stripePaymentIntentId: paymentId,
                };

                if (shippingAddress) sanityOrder.shippingAddress = shippingAddress;
                if (selectedCourier) sanityOrder.selectedCourier = selectedCourier;

                const result = await sanityWriteClient.create(sanityOrder);
                console.log("📦 Created Sanity Order:", result._id);

                // Stock was already reduced when Checkout opened (metadata flag)
                if (!stripeSessionStockWasReserved(metadata)) {
                    for (const item of orderItems) {
                        const productRef = item.product?._ref;
                        if (!productRef) continue;
                        const qty = item.quantity || 1;
                        try {
                            const did = await decrementPhysicalProductStock(
                                sanityWriteClient,
                                productRef,
                                qty,
                            );
                            if (did) {
                                console.log(
                                    `📉 Physical stock adjusted for ${productRef} (−${qty})`,
                                );
                            }
                        } catch (stockErr) {
                            console.error(`Failed to update stock for ${productRef}:`, stockErr);
                        }
                    }
                }

                // Send email notification to store owner
                try {
                    await sendOrderNotification({
                        orderNumber: sanityOrder.orderNumber,
                        customerName: sanityOrder.customerName,
                        customerEmail: sanityOrder.customerEmail,
                        items: orderItems,
                        totalAmount: sanityOrder.totalAmount,
                        currency: (session.currency || "eur").toUpperCase(),
                        selectedCourier,
                        shippingAmount,
                        shippingAddress,
                    });
                } catch (emailErr) {
                    console.error("Failed to send order notification email:", emailErr);
                }

                break;
            }

            case "checkout.session.expired": {
                const session = event.data.object as Stripe.Checkout.Session;
                if (!stripeSessionStockWasReserved(session.metadata)) break;

                await releaseInventoryIfHeld(
                    sanityWriteClient,
                    stripe,
                    session.id,
                    "webhook_expired",
                );
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
