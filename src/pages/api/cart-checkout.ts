import type { APIRoute } from "astro";
import Stripe from "stripe";

interface CartCheckoutItem {
    productId: string;
    name: string;
    price: number;
    quantity: number;
    productType: "physical" | "digital";
    selectedSize?: string;
}

export const POST: APIRoute = async (context) => {
    try {
        const body = await context.request.json();
        const {
            items,
            currency,
            userEmail,
            selectedShippingId,
            selectedShippingAmount,
            selectedShippingLabel,
        } = body as {
            items: CartCheckoutItem[];
            currency: string;
            userEmail: string;
            selectedShippingId?: string;
            selectedShippingAmount?: string;
            selectedShippingLabel?: string;
        };

        if (!items || items.length === 0) {
            return new Response(JSON.stringify({ error: "Cart is empty" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        if (!userEmail) {
            return new Response(JSON.stringify({ error: "User email required" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY);
        const origin = context.request.headers.get("origin") || "http://localhost:4321";
        const resolvedCurrency = (currency || "EUR").toLowerCase();

        const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = items.map((item) => ({
            price_data: {
                currency: resolvedCurrency,
                product_data: {
                    name: item.selectedSize
                        ? `${item.name} (${item.selectedSize})`
                        : item.name,
                },
                unit_amount: Math.round(item.price * 100),
            },
            quantity: item.quantity,
        }));

        const shippingAmount = parseFloat(selectedShippingAmount || "0");
        if (shippingAmount > 0) {
            lineItems.push({
                price_data: {
                    currency: resolvedCurrency,
                    product_data: { name: "Shipping" },
                    unit_amount: Math.round(shippingAmount * 100),
                },
                quantity: 1,
            });
        }

        const hasPhysical = items.some((i) => i.productType === "physical");
        const hasDigital = items.some((i) => i.productType === "digital");
        const orderType = hasPhysical && hasDigital ? "mixed" : hasPhysical ? "physical" : "digital";

        const cartItemsSummary = items.map((i) => ({
            id: i.productId,
            name: i.name,
            qty: i.quantity,
            type: i.productType,
            size: i.selectedSize || "",
            price: i.price,
        }));

        const sessionParams: Stripe.Checkout.SessionCreateParams = {
            mode: "payment",
            line_items: lineItems,
            success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${origin}/cart`,
            customer_email: userEmail,
            metadata: {
                checkoutType: "cart",
                orderType,
                userEmail,
                selectedShippingId: selectedShippingId || "",
                selectedShippingLabel: selectedShippingLabel || "",
                selectedShippingAmount: selectedShippingAmount || "0",
                cartItems: JSON.stringify(cartItemsSummary),
            },
        };

        if (hasPhysical) {
            sessionParams.shipping_address_collection = {
                allowed_countries: [
                    "PL", "DE", "FR", "GB", "US", "NL", "BE", "AT", "IT", "ES",
                    "SE", "DK", "FI", "IE", "PT", "GR", "CZ", "HU", "RO", "BG",
                    "HR", "SI", "SK", "EE", "LV", "LT", "LU", "MT", "CY",
                ],
            };
        }

        const session = await stripe.checkout.sessions.create(sessionParams);

        return new Response(JSON.stringify({ url: session.url }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error: any) {
        console.error("Cart checkout session error:", error);

        let userMessage = "Unable to start checkout. Please try again shortly.";
        if (error?.type === "StripeCardError") {
            userMessage = "Your card was declined. Please try a different payment method.";
        } else if (error?.type === "StripeInvalidRequestError") {
            userMessage = "Payment configuration error. Please contact support.";
        }

        return new Response(JSON.stringify({ error: userMessage }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};
