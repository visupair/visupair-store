import type { APIRoute } from "astro";
import Stripe from "stripe";
import { createClient } from "@sanity/client";
import { requireApiSession } from "../../lib/api-session";
import { checkoutApisEnvGuard } from "../../lib/production-env-check";
import type { CartCheckoutItem } from "../../lib/checkout-cart-types";
import {
    assertProductMatchesCartLine,
    buildParcelFromCartPhysicalLines,
    CheckoutMoneyError,
    fetchProductsForCheckout,
    minorUnitsForCatalogPrice,
    normalizedCheckoutCurrency,
    resolveShippingAmountMinorUnits,
} from "../../lib/checkout-server-money";
import {
    tryReservePhysicalStock,
    releasePhysicalStock,
    StockReservationError,
} from "../../lib/physical-stock-reservation";
import {
    buildCheckoutOriginAllowlist,
    mergeCheckoutEnvFromContext,
    resolveCheckoutOrigin,
} from "../../lib/checkout-request-origin";

function aggregatePhysicalCartQuantities(
    items: CartCheckoutItem[],
): { ref: string; qty: number }[] {
    const map = new Map<string, number>();
    for (const item of items) {
        if (item.productType !== "physical") continue;
        const q = Math.max(1, item.quantity || 1);
        map.set(item.productId, (map.get(item.productId) || 0) + q);
    }
    return [...map.entries()].map(([ref, qty]) => ({ ref, qty }));
}

export const POST: APIRoute = async (context) => {
    try {
        const authResult = await requireApiSession(context);
        if ("response" in authResult) {
            return authResult.response;
        }
        const { user: sessionUser } = authResult;

        const envBlock = checkoutApisEnvGuard();
        if (envBlock) {
            return envBlock;
        }

        const mergedEnv = await mergeCheckoutEnvFromContext(context);
        const originAllowlist = buildCheckoutOriginAllowlist(mergedEnv);
        const origin = resolveCheckoutOrigin(context.request, originAllowlist);
        if (!origin) {
            return new Response(JSON.stringify({ error: "Invalid request origin." }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        const body = await context.request.json();
        const {
            items,
            currency,
            selectedShippingId,
            selectedShippingAmount,
            selectedShippingLabel,
            shippingAddress,
        } = body as {
            items: CartCheckoutItem[];
            currency: string;
            selectedShippingId?: string;
            selectedShippingAmount?: string;
            selectedShippingLabel?: string;
            shippingAddress?: {
                firstName?: string;
                lastName?: string;
                address?: string;
                apartment?: string;
                city?: string;
                postalCode?: string;
                country?: string;
                phone?: string;
            };
        };

        if (!items || items.length === 0) {
            return new Response(JSON.stringify({ error: "Cart is empty" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        const userEmail = sessionUser.email;

        const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY);
        const sanity = createClient({
            projectId: "sovnyov1",
            dataset: "production",
            useCdn: false,
            token: import.meta.env.SANITY_API_TOKEN,
            apiVersion: "2024-03-01",
        });

        const checkoutCurrency = normalizedCheckoutCurrency(currency);

        const productDocs = await fetchProductsForCheckout(
            sanity,
            items.map((i) => i.productId),
        );
        const byId = new Map(productDocs.map((d) => [d._id, d]));

        const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
        const pricedSummary: {
            id: string;
            name: string;
            qty: number;
            type: "physical" | "digital";
            size: string;
            price: number;
        }[] = [];

        for (const item of items) {
            const doc = byId.get(item.productId);
            assertProductMatchesCartLine(item, doc);

            const qty = Math.max(1, item.quantity || 1);
            const minor = minorUnitsForCatalogPrice(checkoutCurrency, doc.price, doc.pricePLN);
            if (minor <= 0) {
                return new Response(JSON.stringify({ error: "Invalid product price in catalog." }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                });
            }

            const displayName = item.selectedSize
                ? `${doc.name} (${item.selectedSize})`
                : doc.name;

            lineItems.push({
                price_data: {
                    currency: checkoutCurrency,
                    product_data: { name: displayName },
                    unit_amount: minor,
                },
                quantity: qty,
            });

            const major = minor / 100;
            pricedSummary.push({
                id: item.productId,
                name: doc.name,
                qty,
                type: item.productType,
                size: item.selectedSize || "",
                price: major,
            });
        }

        const hasPhysical = items.some((i) => i.productType === "physical");
        const hasDigital = items.some((i) => i.productType === "digital");
        const orderType = hasPhysical && hasDigital ? "mixed" : hasPhysical ? "physical" : "digital";

        let shippingMinor = 0;
        let shippingAmountMeta = "0";
        let shippingLabelMeta = selectedShippingLabel || "";

        if (hasPhysical) {
            if (!shippingAddress) {
                return new Response(JSON.stringify({ error: "Shipping address required." }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                });
            }
            if (!selectedShippingId || !String(selectedShippingId).trim()) {
                return new Response(JSON.stringify({ error: "Shipping method required." }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                });
            }

            const parcel = buildParcelFromCartPhysicalLines(items, byId);
            const resolved = await resolveShippingAmountMinorUnits({
                shippingAddress: {
                    address: shippingAddress.address,
                    city: shippingAddress.city,
                    postalCode: shippingAddress.postalCode,
                    country: shippingAddress.country,
                },
                selectedShippingId: String(selectedShippingId),
                parcel,
                checkoutCurrency,
            });

            shippingMinor = resolved.minorUnits;
            if (shippingMinor <= 0) {
                return new Response(JSON.stringify({ error: "Invalid shipping amount." }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                });
            }

            shippingLabelMeta = resolved.providerLabel || shippingLabelMeta;
            shippingAmountMeta = (shippingMinor / 100).toFixed(2);

            lineItems.push({
                price_data: {
                    currency: checkoutCurrency,
                    product_data: { name: "Shipping" },
                    unit_amount: shippingMinor,
                },
                quantity: 1,
            });
        }

        const physicalLines = aggregatePhysicalCartQuantities(items);
        const stockHolds: { ref: string; qty: number }[] = [];
        let physicalStockReserved = false;

        try {
            for (const line of physicalLines) {
                const held = await tryReservePhysicalStock(
                    sanity,
                    line.ref,
                    line.qty,
                );
                if (held) {
                    stockHolds.push({ ref: line.ref, qty: line.qty });
                    physicalStockReserved = true;
                }
            }
        } catch (invErr: any) {
            for (const h of [...stockHolds].reverse()) {
                try {
                    await releasePhysicalStock(sanity, h.ref, h.qty);
                } catch (e) {
                    console.error("Rollback cart stock reservation:", e);
                }
            }
            if (invErr instanceof StockReservationError) {
                return new Response(
                    JSON.stringify({
                        error: invErr.message,
                        code: invErr.code,
                    }),
                    { status: 409, headers: { "Content-Type": "application/json" } },
                );
            }
            throw invErr;
        }

        // Build shipping address metadata from our checkout form
        const shippingMeta: Record<string, string> = {};
        if (shippingAddress && hasPhysical) {
            const fullName = [shippingAddress.firstName, shippingAddress.lastName].filter(Boolean).join(" ");
            shippingMeta.shippingName = fullName;
            shippingMeta.shippingStreet = [shippingAddress.address, shippingAddress.apartment].filter(Boolean).join(", ");
            shippingMeta.shippingCity = shippingAddress.city || "";
            shippingMeta.shippingZip = shippingAddress.postalCode || "";
            shippingMeta.shippingCountry = shippingAddress.country || "";
            shippingMeta.shippingPhone = shippingAddress.phone || "";
            shippingMeta.firstName = shippingAddress.firstName || "";
            shippingMeta.lastName = shippingAddress.lastName || "";
        }

        const sessionExpiresAt = Math.floor(Date.now() / 1000) + 30 * 60;

        const cancelReturn = `${origin}/checkout/cancelled?session_id={CHECKOUT_SESSION_ID}&next=${encodeURIComponent(`${origin}/cart`)}`;

        const sessionParams: Stripe.Checkout.SessionCreateParams = {
            mode: "payment",
            line_items: lineItems,
            success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: cancelReturn,
            customer_email: sessionUser.email,
            expires_at: sessionExpiresAt,
            metadata: {
                checkoutType: "cart",
                orderType,
                userEmail,
                selectedShippingId: selectedShippingId || "",
                selectedShippingLabel: shippingLabelMeta,
                selectedShippingAmount: shippingAmountMeta,
                cartItems: JSON.stringify(pricedSummary),
                physicalStockReserved: physicalStockReserved ? "true" : "false",
                ...shippingMeta,
            },
        };

        let session: Stripe.Response<Stripe.Checkout.Session>;
        try {
            session = await stripe.checkout.sessions.create(sessionParams);
        } catch (stripeErr) {
            for (const h of [...stockHolds].reverse()) {
                try {
                    await releasePhysicalStock(sanity, h.ref, h.qty);
                } catch (e) {
                    console.error("Rollback cart stock after Stripe error:", e);
                }
            }
            throw stripeErr;
        }

        return new Response(JSON.stringify({ url: session.url }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error: any) {
        if (error instanceof CheckoutMoneyError) {
            return new Response(JSON.stringify({ error: error.message }), {
                status: error.status,
                headers: { "Content-Type": "application/json" },
            });
        }

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
