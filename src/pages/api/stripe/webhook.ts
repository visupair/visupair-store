import type { APIRoute } from "astro";
import Stripe from "stripe";
import { createClient } from "@sanity/client";
import { sendOrderNotification } from "../../../lib/email";

const sanityWriteClient = createClient({
    projectId: "sovnyov1",
    dataset: "production",
    useCdn: false,
    apiVersion: "2024-03-01",
    token: import.meta.env.SANITY_API_TOKEN,
});

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
                const internalUserEmail = metadata.userEmail;
                const isCartCheckout = metadata.checkoutType === "cart";

                let shippingAddress = null;
                const sessionDetails = session as any;
                if (sessionDetails.shipping_details?.address) {
                    const addr = sessionDetails.shipping_details.address;
                    shippingAddress = {
                        name: sessionDetails.shipping_details.name || "",
                        street: addr.line1 || "",
                        city: addr.city || "",
                        zip: addr.postal_code || "",
                        country: addr.country || "",
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

                const sanityOrder: any = {
                    _type: "order",
                    createdAt: new Date().toISOString(),
                    orderNumber: session.payment_intent?.toString() || session.id,
                    orderType,
                    status: "paid",
                    customerEmail: internalUserEmail || session.customer_details?.email || "",
                    customerName: session.customer_details?.name || "",
                    items: orderItems,
                    totalAmount: (session.amount_total || 0) / 100,
                    currency: session.currency?.toUpperCase() || "EUR",
                    paymentProvider: "stripe",
                    stripePaymentIntentId: session.payment_intent?.toString() || session.id,
                };

                if (shippingAddress) sanityOrder.shippingAddress = shippingAddress;
                if (selectedCourier) sanityOrder.selectedCourier = selectedCourier;
                if (shippingAmount > 0) sanityOrder.shippingAmount = shippingAmount;

                const result = await sanityWriteClient.create(sanityOrder);
                console.log("📦 Created Sanity Order:", result._id);

                // Decrement stock for each purchased product
                for (const item of orderItems) {
                    const productRef = item.product?._ref;
                    if (!productRef) continue;
                    const qty = item.quantity || 1;

                    try {
                        const product = await sanityWriteClient.getDocument(productRef);
                        if (product) {
                            const currentStock = typeof product.stock === "number" ? product.stock : 1;
                            const newStock = Math.max(0, currentStock - qty);
                            const patch: Record<string, any> = { stock: newStock };
                            if (newStock === 0) patch.inStock = false;
                            await sanityWriteClient.patch(productRef).set(patch).commit();
                            console.log(`📉 Stock updated: ${productRef} → ${newStock}${newStock === 0 ? " (SOLD OUT)" : ""}`);
                        }
                    } catch (stockErr) {
                        console.error(`Failed to update stock for ${productRef}:`, stockErr);
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
                        currency: sanityOrder.currency,
                        selectedCourier,
                        shippingAmount,
                        shippingAddress,
                    });
                } catch (emailErr) {
                    console.error("Failed to send order notification email:", emailErr);
                }

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
