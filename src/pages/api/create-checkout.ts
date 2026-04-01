import type { APIRoute } from "astro";
import Stripe from "stripe";
import { createClient } from "@sanity/client";
import {
    courseRegistrationExists,
    COURSE_REGISTRATION_DUPLICATE_MESSAGE,
} from "../../lib/course-registration-dedupe";
import { assertCourseAcceptsRegistrations, COURSE_FULL_MESSAGE } from "../../lib/course-capacity";

const sanityClient = createClient({
    projectId: "sovnyov1",
    dataset: "production",
    useCdn: false,
    token: import.meta.env.SANITY_API_TOKEN,
    apiVersion: "2024-03-01",
});

export const POST: APIRoute = async (context) => {
    try {
        const body = await context.request.json();
        const {
            productId,
            priceId,
            productName,
            productType,
            userEmail,
            price,
            currency,
            shippingAddress,
            selectedShippingId,
            selectedShippingAmount,
            firstName,
            lastName,
            phone,
            courseName,
        } = body;

        const isCourseDonation = productType === "course_donation";
        const isCoursePaid = productType === "course";

        if (isCoursePaid) {
            if (
                !userEmail ||
                !String(firstName || "").trim() ||
                !String(lastName || "").trim()
            ) {
                return new Response(JSON.stringify({ error: "Name and email are required for course checkout" }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                });
            }
        }

        if (!priceId && !price && !isCourseDonation) {
            return new Response(JSON.stringify({ error: "Missing price information" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        if (isCourseDonation) {
            const amt = parseFloat(String(price));
            if (
                !amt ||
                amt <= 0 ||
                !userEmail ||
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

        if ((isCourseDonation || isCoursePaid) && productId && userEmail) {
            if (await courseRegistrationExists(sanityClient, String(productId), String(userEmail))) {
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

        const origin = context.request.headers.get("origin") || "http://localhost:4321";

        // Normalise currency
        const resolvedCurrency = (currency || "EUR").toUpperCase();

        // Build line items — ALL must use the same currency.
        // Use price_data for everything, so we can control the currency.
        // Only fall back to a priceId (Stripe-stored price) when no explicit
        // currency override is needed (i.e., EUR and no shipping).
        const usePriceData =
            isCourseDonation ||
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

        const donationMetadata: Record<string, string> = isCourseDonation
            ? {
                checkoutType: "course_donation",
                courseId: String(productId),
                courseName: String(courseName || productName || "Course").slice(0, 120),
                firstName: String(firstName || "").slice(0, 80),
                lastName: String(lastName || "").slice(0, 80),
                phone: String(phone || "").slice(0, 40),
                userEmail: String(userEmail),
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


        // Build shipping metadata from the address already collected on our site
        const shippingMeta: Record<string, string> = {};
        if (shippingAddress && productType === "physical") {
            shippingMeta.shippingName = String(shippingAddress.firstName || "") + " " + String(shippingAddress.lastName || "");
            shippingMeta.shippingStreet = String(shippingAddress.address || shippingAddress.street || "");
            shippingMeta.shippingCity = String(shippingAddress.city || "");
            shippingMeta.shippingZip = String(shippingAddress.postalCode || shippingAddress.zip || "");
            shippingMeta.shippingCountry = String(shippingAddress.country || "");
            shippingMeta.shippingPhone = String(shippingAddress.phone || phone || "");
        }

        const sessionParams: Stripe.Checkout.SessionCreateParams = {
            mode: "payment",
            line_items: lineItems,
            success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}${isCourseDonation ? "&course_donation=1" : ""}`,
            cancel_url: context.request.headers.get("referer") || `${origin}/`,
            customer_email: userEmail,
            metadata: {
                productId: productId || "",
                productType: isCourseDonation ? "course_donation" : productType || "physical",
                userEmail: userEmail || "",
                selectedShippingId: selectedShippingId || "",
                selectedShippingAmount: selectedShippingAmount || "0",
                firstName: firstName || "",
                lastName: lastName || "",
                ...shippingMeta,
                ...donationMetadata,
                ...coursePaidMetadata,
            },
        };

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
