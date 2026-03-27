import type { APIRoute } from "astro";
import Stripe from "stripe";

export const POST: APIRoute = async (context) => {
    try {
        const body = await context.request.json();
        const { productId, priceId, productName, productType, userEmail, price, currency, shippingAddress, selectedShippingId, selectedShippingAmount } = body;

        if (!priceId && !price) {
            return new Response(JSON.stringify({ error: "Missing price information" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY);

        const origin = context.request.headers.get("origin") || "http://localhost:4321";

        // Normalise currency
        const resolvedCurrency = (currency || "EUR").toUpperCase();

        // Build line items — ALL must use the same currency.
        // Use price_data for everything, so we can control the currency.
        // Only fall back to a priceId (Stripe-stored price) when no explicit
        // currency override is needed (i.e., EUR and no shipping).
        const usePriceData =
            resolvedCurrency !== "EUR" ||
            (selectedShippingAmount && parseFloat(selectedShippingAmount) > 0);

        const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

        if (priceId && !usePriceData) {
            // Use a Stripe Price ID (pre-configured product, EUR only, no PLN shipping)
            lineItems.push({ price: priceId, quantity: 1 });
        } else {
            // Use a dynamic one-off price so we can control currency & amount
            lineItems.push({
                price_data: {
                    currency: resolvedCurrency.toLowerCase(),
                    product_data: { name: productName || "Product" },
                    unit_amount: Math.round((price || 0) * 100),
                },
                quantity: 1,
            });
        }

        // Add shipping as a separate line item in the SAME currency
        if (selectedShippingAmount && parseFloat(selectedShippingAmount) > 0 && productType === "physical") {
            lineItems.push({
                price_data: {
                    currency: resolvedCurrency.toLowerCase(),
                    product_data: { name: "Shipping" },
                    unit_amount: Math.round(parseFloat(selectedShippingAmount) * 100),
                },
                quantity: 1,
            });
        }


        const sessionParams: Stripe.Checkout.SessionCreateParams = {
            mode: "payment",
            line_items: lineItems,
            success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: context.request.headers.get("referer") || `${origin}/`,
            customer_email: userEmail,
            metadata: {
                productId: productId || "",
                productType: productType || "physical",
                userEmail: userEmail || "",
                selectedShippingId: selectedShippingId || "",
            },
        };

        // Collect shipping address for physical products
        if (productType === "physical") {
            sessionParams.shipping_address_collection = {
                allowed_countries: ["PL", "DE", "FR", "GB", "US", "NL", "BE", "AT", "IT", "ES"],
            };
        }

        const session = await stripe.checkout.sessions.create(sessionParams);

        return new Response(JSON.stringify({ url: session.url }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error: any) {
        console.error("Stripe checkout session error:", error);

        // Map Stripe error types to safe, user-friendly messages.
        // Never expose raw Stripe messages to the client.
        let userMessage = "Unable to start checkout. Please try again shortly.";
        if (error?.type === "StripeCardError") {
            userMessage = "Your card was declined. Please try a different payment method.";
        } else if (error?.type === "StripeInvalidRequestError") {
            userMessage = "Payment configuration error. Please contact support.";
        } else if (error?.type === "StripeAuthenticationError") {
            userMessage = "Payment service authentication failed. Please contact support.";
        } else if (error?.code === "ECONNREFUSED" || error?.code === "ETIMEDOUT") {
            userMessage = "Payment service is temporarily unavailable. Please try again in a moment.";
        }

        return new Response(JSON.stringify({ error: userMessage }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};
