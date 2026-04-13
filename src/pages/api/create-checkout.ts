import type { APIRoute } from "astro";
import Stripe from "stripe";
import { createClient } from "@sanity/client";
import { requireApiSession } from "../../lib/api-session";
import { checkoutApisEnvGuard } from "../../lib/production-env-check";
import type { CartCheckoutItem } from "../../lib/checkout-cart-types";
import {
    assertSingleProductStoreCheckout,
    buildParcelFromCartPhysicalLines,
    CheckoutMoneyError,
    fetchCourseForCheckout,
    fetchProductsForCheckout,
    minorUnitsForCatalogPrice,
    normalizedCheckoutCurrency,
    resolveShippingAmountMinorUnits,
} from "../../lib/checkout-server-money";
import {
    courseRegistrationExists,
    COURSE_REGISTRATION_DUPLICATE_MESSAGE,
} from "../../lib/course-registration-dedupe";
import { assertCourseAcceptsRegistrations, COURSE_FULL_MESSAGE } from "../../lib/course-capacity";
import {
    tryReservePhysicalStock,
    releasePhysicalStock,
    StockReservationError,
} from "../../lib/physical-stock-reservation";
import {
    buildCheckoutOriginAllowlist,
    mergeCheckoutEnvFromContext,
    resolveCheckoutOrigin,
    safeRefererForCancelRedirect,
} from "../../lib/checkout-request-origin";

const sanityClient = createClient({
    projectId: "sovnyov1",
    dataset: "production",
    useCdn: false,
    token: import.meta.env.SANITY_API_TOKEN,
    apiVersion: "2024-03-01",
});

const MAX_MAJOR_DONATION = 100_000;

export const POST: APIRoute = async (context) => {
    try {
        const authResult = await requireApiSession(context, {
            unauthorizedMessage: "Sign in required to continue to checkout.",
        });
        if ("response" in authResult) {
            return authResult.response;
        }
        const { user: sessionUser } = authResult;
        const sessionEmail = sessionUser.email;

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
            productId,
            priceId,
            productName,
            productType,
            price,
            currency,
            shippingAddress,
            selectedShippingId,
            selectedShippingAmount,
            firstName,
            lastName,
            phone,
            courseName,
            selectedSize,
        } = body;

        const isCourseDonation = productType === "course_donation";
        const isCoursePaid = productType === "course";

        if (isCoursePaid) {
            if (
                !String(firstName || "").trim() ||
                !String(lastName || "").trim()
            ) {
                return new Response(JSON.stringify({ error: "Name is required for course checkout" }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                });
            }
        }

        if (!isCourseDonation) {
            if (!priceId && (price == null || price === "") && productType !== "course") {
                return new Response(JSON.stringify({ error: "Missing price information" }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                });
            }
        }

        if (isCourseDonation) {
            const amt = parseFloat(String(price));
            if (
                !Number.isFinite(amt) ||
                amt < 0.01 ||
                amt > MAX_MAJOR_DONATION ||
                !productId ||
                !String(firstName || "").trim() ||
                !String(lastName || "").trim()
            ) {
                return new Response(JSON.stringify({ error: "Invalid donation checkout" }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                });
            }
        }

        if ((isCourseDonation || isCoursePaid) && productId && sessionEmail) {
            if (await courseRegistrationExists(sanityClient, String(productId), String(sessionEmail))) {
                return new Response(JSON.stringify({ error: COURSE_REGISTRATION_DUPLICATE_MESSAGE }), {
                    status: 409,
                    headers: { "Content-Type": "application/json" },
                });
            }

            const capacity = await assertCourseAcceptsRegistrations(sanityClient, String(productId));
            if (!capacity.ok) {
                return new Response(JSON.stringify({ error: capacity.message || COURSE_FULL_MESSAGE }), {
                    status: 403,
                    headers: { "Content-Type": "application/json" },
                });
            }
        }

        const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY);

        const resolvedCurrencyUpper = (currency || "EUR").toUpperCase();
        const checkoutCurrency = normalizedCheckoutCurrency(currency);

        const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
        let metadataShippingAmount = selectedShippingAmount || "0";
        let metadataShippingLabel = "";

        if (isCourseDonation) {
            const course = await fetchCourseForCheckout(sanityClient, String(productId));
            if (!course || course.pricingType !== "donation") {
                return new Response(JSON.stringify({ error: "Invalid donation checkout" }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                });
            }
            const amt = parseFloat(String(price));
            const unitMinor = Math.round(amt * 100);
            if (unitMinor < 1) {
                return new Response(JSON.stringify({ error: "Invalid donation amount" }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                });
            }
            lineItems.push({
                price_data: {
                    currency: checkoutCurrency,
                    product_data: {
                        name: productName || course.name || "Course donation",
                    },
                    unit_amount: unitMinor,
                },
                quantity: 1,
            });
        } else if (isCoursePaid) {
            const course = await fetchCourseForCheckout(sanityClient, String(productId));
            if (!course || course.pricingType !== "paid") {
                return new Response(JSON.stringify({ error: "This course is not available for paid online checkout." }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                });
            }

            const usePriceData =
                resolvedCurrencyUpper !== "EUR" ||
                !priceId ||
                !course.stripePriceId ||
                String(priceId) !== String(course.stripePriceId);

            if (!usePriceData && course.stripePriceId) {
                lineItems.push({ price: String(priceId), quantity: 1 });
            } else {
                const minor = minorUnitsForCatalogPrice(
                    checkoutCurrency,
                    Number(course.price) || 0,
                    course.pricePLN,
                );
                if (minor <= 0) {
                    return new Response(JSON.stringify({ error: "Course price is not configured." }), {
                        status: 400,
                        headers: { "Content-Type": "application/json" },
                    });
                }
                lineItems.push({
                    price_data: {
                        currency: checkoutCurrency,
                        product_data: {
                            name: courseName || course.name || productName || "Course",
                        },
                        unit_amount: minor,
                    },
                    quantity: 1,
                });
            }
        } else if (productId) {
            const docs = await fetchProductsForCheckout(sanityClient, [String(productId)]);
            const doc = docs[0];
            assertSingleProductStoreCheckout(
                doc,
                productType === "digital" ? "digital" : "physical",
                typeof selectedSize === "string" ? selectedSize : undefined,
            );

            if (doc.isFree) {
                return new Response(
                    JSON.stringify({
                        error:
                            "Free digital products are claimed from the product page while signed in, not through checkout.",
                    }),
                    {
                        status: 400,
                        headers: { "Content-Type": "application/json" },
                    },
                );
            }

            const useShipping =
                doc.productType === "physical" &&
                !!(selectedShippingId && String(selectedShippingId).trim());

            const usePriceData =
                resolvedCurrencyUpper !== "EUR" ||
                useShipping ||
                !priceId ||
                !doc.stripePriceId ||
                String(priceId) !== String(doc.stripePriceId);

            if (!usePriceData && doc.stripePriceId) {
                lineItems.push({ price: String(priceId), quantity: 1 });
            } else {
                const minor = minorUnitsForCatalogPrice(checkoutCurrency, doc.price, doc.pricePLN);
                if (minor <= 0) {
                    return new Response(JSON.stringify({ error: "Product price is not configured." }), {
                        status: 400,
                        headers: { "Content-Type": "application/json" },
                    });
                }
                const displayName = selectedSize
                    ? `${doc.name} (${String(selectedSize)})`
                    : doc.name;
                lineItems.push({
                    price_data: {
                        currency: checkoutCurrency,
                        product_data: { name: displayName },
                        unit_amount: minor,
                    },
                    quantity: 1,
                });
            }

            if (doc.productType === "physical") {
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

                const cartLike: CartCheckoutItem[] = [
                    {
                        productId: String(productId),
                        name: doc.name,
                        price: 0,
                        quantity: 1,
                        productType: "physical",
                        selectedSize: typeof selectedSize === "string" ? selectedSize : undefined,
                    },
                ];
                const byId = new Map([[doc._id, doc]]);
                const parcel = buildParcelFromCartPhysicalLines(cartLike, byId);

                const resolved = await resolveShippingAmountMinorUnits({
                    shippingAddress: {
                        address: shippingAddress.address,
                        street: shippingAddress.street,
                        city: shippingAddress.city,
                        postalCode: shippingAddress.postalCode,
                        zip: shippingAddress.zip,
                        country: shippingAddress.country,
                    },
                    selectedShippingId: String(selectedShippingId),
                    parcel,
                    checkoutCurrency,
                });

                if (resolved.minorUnits <= 0) {
                    return new Response(JSON.stringify({ error: "Invalid shipping amount." }), {
                        status: 400,
                        headers: { "Content-Type": "application/json" },
                    });
                }

                metadataShippingAmount = (resolved.minorUnits / 100).toFixed(2);
                metadataShippingLabel = resolved.providerLabel;

                lineItems.push({
                    price_data: {
                        currency: checkoutCurrency,
                        product_data: { name: "Shipping" },
                        unit_amount: resolved.minorUnits,
                    },
                    quantity: 1,
                });
            }
        } else {
            return new Response(JSON.stringify({ error: "Missing product" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        /** Reserved after pricing is validated; rolled back if session creation fails */
        const stockHolds: { ref: string; qty: number }[] = [];
        let physicalStockReserved = false;

        if (productId && !isCourseDonation && !isCoursePaid) {
            try {
                const held = await tryReservePhysicalStock(
                    sanityClient,
                    String(productId),
                    1,
                );
                if (held) {
                    stockHolds.push({ ref: String(productId), qty: 1 });
                    physicalStockReserved = true;
                }
            } catch (invErr: any) {
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
        }

        const donationMetadata: Record<string, string> = isCourseDonation
            ? {
                  checkoutType: "course_donation",
                  courseId: String(productId),
                  courseName: String(courseName || productName || "Course").slice(0, 120),
                  firstName: String(firstName || "").slice(0, 80),
                  lastName: String(lastName || "").slice(0, 80),
                  phone: String(phone || "").slice(0, 40),
                  userEmail: String(sessionEmail),
              }
            : {};

        const coursePaidMetadata: Record<string, string> =
            isCoursePaid && !isCourseDonation
                ? {
                      courseName: String(courseName || productName || "").slice(0, 120),
                      firstName: String(firstName || "").slice(0, 80),
                      lastName: String(lastName || "").slice(0, 80),
                      phone: String(phone || "").slice(0, 40),
                  }
                : {};

        const shippingMeta: Record<string, string> = {};
        if (
            shippingAddress &&
            productType === "physical"
        ) {
            shippingMeta.shippingName =
                String(shippingAddress.firstName || "") + " " + String(shippingAddress.lastName || "");
            shippingMeta.shippingStreet = String(shippingAddress.address || shippingAddress.street || "");
            shippingMeta.shippingCity = String(shippingAddress.city || "");
            shippingMeta.shippingZip = String(shippingAddress.postalCode || shippingAddress.zip || "");
            shippingMeta.shippingCountry = String(shippingAddress.country || "");
            shippingMeta.shippingPhone = String(shippingAddress.phone || phone || "");
        }

        const sessionExpiresAt = Math.floor(Date.now() / 1000) + 30 * 60;

        const refererForCancel = safeRefererForCancelRedirect(
            context.request.headers.get("referer"),
            origin,
            originAllowlist,
        );
        const cancelReturn = `${origin}/checkout/cancelled?session_id={CHECKOUT_SESSION_ID}&next=${encodeURIComponent(refererForCancel)}`;

        const sessionParams: Stripe.Checkout.SessionCreateParams = {
            mode: "payment",
            line_items: lineItems,
            success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}${isCourseDonation ? "&course_donation=1" : ""}`,
            cancel_url: cancelReturn,
            customer_email: sessionEmail,
            expires_at: sessionExpiresAt,
            metadata: {
                productId: productId || "",
                productType: isCourseDonation ? "course_donation" : productType || "physical",
                userEmail: sessionEmail,
                selectedShippingId: selectedShippingId || "",
                selectedShippingLabel: metadataShippingLabel,
                selectedShippingAmount: metadataShippingAmount,
                firstName: firstName || "",
                lastName: lastName || "",
                physicalStockReserved: physicalStockReserved ? "true" : "false",
                ...shippingMeta,
                ...donationMetadata,
                ...coursePaidMetadata,
            },
        };

        let session: Stripe.Response<Stripe.Checkout.Session>;
        try {
            session = await stripe.checkout.sessions.create(sessionParams);
        } catch (stripeErr) {
            for (const h of [...stockHolds].reverse()) {
                try {
                    await releasePhysicalStock(sanityClient, h.ref, h.qty);
                } catch (e) {
                    console.error("Rollback stock after Stripe error:", e);
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

        console.error("Stripe checkout session error:", error);

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
