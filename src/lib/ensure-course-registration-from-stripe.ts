import type Stripe from "stripe";
import type { SanityClient } from "@sanity/client";
import { courseRegistrationExists } from "./course-registration-dedupe";
import {
    assertCourseAcceptsRegistrations,
    maybeCloseCourseWhenFull,
} from "./course-capacity";

export type CourseRegistrationStripeOutcome =
    | { action: "registered"; registrationId: string }
    | { action: "continue" }
    | { action: "stop"; reason: string };

/**
 * If this Stripe Checkout session is a course signup (donation or paid online),
 * ensure a `courseRegistration` exists in Sanity (idempotent by `stripeCheckoutSessionId`).
 *
 * - Returns `registered` when a row exists or was created — caller must NOT create a store `order`.
 * - Returns `continue` for non-course checkouts — caller may create an `order` as usual.
 * - Returns `stop` when this was clearly a course checkout but registration must not proceed
 *   (e.g. duplicate, full) — caller must NOT create an `order` either.
 */
export async function ensureCourseRegistrationFromStripeSession(
    session: Stripe.Checkout.Session,
    sanity: SanityClient,
): Promise<CourseRegistrationStripeOutcome> {
    const metadata = session.metadata || {};
    const stripeCheckoutSessionId = session.id;
    const isCartCheckout = metadata.checkoutType === "cart";
    const isCourseDonation =
        metadata.checkoutType === "course_donation" && Boolean(metadata.courseId);
    const isCourseDonationFlag = metadata.checkoutType === "course_donation";
    const isCoursePaidCheckout =
        metadata.productType === "course" &&
        Boolean(metadata.productId) &&
        !isCourseDonationFlag;

    if (isCartCheckout || (!isCourseDonation && !isCoursePaidCheckout)) {
        return { action: "continue" };
    }

    const internalUserEmail = (
        metadata.userEmail ||
        session.customer_details?.email ||
        (session as Stripe.Checkout.Session & { customer_email?: string })
            .customer_email ||
        ""
    ).trim();

    const existingBySession = (await sanity.fetch(
        `*[_type == "courseRegistration" && stripeCheckoutSessionId == $sid][0]{ _id }`,
        { sid: stripeCheckoutSessionId },
    )) as { _id: string } | null;

    if (existingBySession?._id) {
        return {
            action: "registered",
            registrationId: existingBySession._id,
        };
    }

    if (isCourseDonation) {
        const courseId = String(metadata.courseId);
        if (
            internalUserEmail &&
            (await courseRegistrationExists(
                sanity,
                courseId,
                internalUserEmail,
            ))
        ) {
            console.warn(
                "[course-reg] Duplicate email for course donation checkout:",
                courseId,
                internalUserEmail,
            );
            return {
                action: "stop",
                reason: "duplicate_registration",
            };
        }

        const capacity = await assertCourseAcceptsRegistrations(sanity, courseId);
        if (!capacity.ok) {
            console.warn(
                "[course-reg] Course full — donation checkout:",
                courseId,
                capacity.message,
            );
            return { action: "stop", reason: "course_full" };
        }

        const amount = (session.amount_total || 0) / 100;
        const currency = (session.currency || "eur").toUpperCase();
        const regDoc: Record<string, unknown> = {
            _type: "courseRegistration",
            course: { _type: "reference", _ref: courseId },
            courseName: metadata.courseName || "",
            firstName: metadata.firstName || "",
            lastName: metadata.lastName || "",
            email: internalUserEmail || session.customer_details?.email || "",
            phone: metadata.phone || undefined,
            pricingType: "donation",
            donationAmount: amount,
            donationCurrency: currency === "PLN" ? "PLN" : "EUR",
            stripeCheckoutSessionId,
            createdAt: new Date().toISOString(),
        };

        const reg = await sanity.create(regDoc as any);
        console.log("[course-reg] Created donation registration:", reg._id);
        return { action: "registered", registrationId: reg._id as string };
    }

    /* Paid online course */
    const productId = String(metadata.productId);
    if (
        internalUserEmail &&
        (await courseRegistrationExists(sanity, productId, internalUserEmail))
    ) {
        console.warn(
            "[course-reg] Duplicate email for paid course checkout:",
            productId,
            internalUserEmail,
        );
        return { action: "stop", reason: "duplicate_registration" };
    }

    const capacityPaid = await assertCourseAcceptsRegistrations(
        sanity,
        productId,
    );
    if (!capacityPaid.ok) {
        console.warn(
            "[course-reg] Course full — paid checkout:",
            productId,
            capacityPaid.message,
        );
        return { action: "stop", reason: "course_full" };
    }

    const amount = (session.amount_total || 0) / 100;
    const currency = (session.currency || "eur").toUpperCase();
    const regDoc: Record<string, unknown> = {
        _type: "courseRegistration",
        course: { _type: "reference", _ref: productId },
        courseName: (metadata.courseName as string) || "",
        firstName: metadata.firstName || "",
        lastName: metadata.lastName || "",
        email: internalUserEmail || session.customer_details?.email || "",
        phone: metadata.phone || undefined,
        pricingType: "paid",
        paidAmount: amount,
        paidCurrency: currency === "PLN" ? "PLN" : "EUR",
        stripeCheckoutSessionId,
        createdAt: new Date().toISOString(),
    };

    const reg = await sanity.create(regDoc as any);
    console.log("[course-reg] Created paid course registration:", reg._id);
    await maybeCloseCourseWhenFull(sanity, productId);

    return { action: "registered", registrationId: reg._id as string };
}
