import type { APIRoute } from 'astro';
import { createClient } from "@sanity/client";
import {
    courseRegistrationExists,
    COURSE_REGISTRATION_DUPLICATE_MESSAGE,
} from "../../lib/course-registration-dedupe";
import {
    assertCourseAcceptsRegistrations,
    maybeCloseCourseWhenFull,
} from "../../lib/course-capacity";
import { fetchCourseForCheckout } from "../../lib/checkout-server-money";
import {
    checkRateLimit,
    RATE_LIMITS,
    resolveVisupairKv,
} from "../../lib/rate-limit-kv";

const sanityWriteClient = createClient({
    projectId: 'sovnyov1',
    dataset: 'production',
    useCdn: false,
    token: import.meta.env.SANITY_API_TOKEN,
    apiVersion: '2024-03-01',
});

export const POST: APIRoute = async (context) => {
    const { request } = context;
    try {
        const kv = await resolveVisupairKv(context);
        const rl = await checkRateLimit(kv, request, RATE_LIMITS.courseRegister);
        if (!rl.ok) {
            return new Response(
                JSON.stringify({
                    success: false,
                    message: 'Too many registration attempts. Please try again later.',
                }),
                {
                    status: 429,
                    headers: {
                        'Content-Type': 'application/json',
                        'Retry-After': String(rl.retryAfterSeconds),
                    },
                },
            );
        }

        const data = await request.json();
        const { firstName, lastName, email, phone, courseId, courseName, donationAmount } = data;

        if (!firstName || !lastName || !email || !courseId) {
            return new Response(JSON.stringify({
                success: false,
                message: 'First name, last name, email, and course are required',
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return new Response(JSON.stringify({
                success: false,
                message: 'Please provide a valid email address',
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const cid = String(courseId).trim();
        const courseDoc = await fetchCourseForCheckout(sanityWriteClient, cid);
        if (!courseDoc) {
            return new Response(JSON.stringify({
                success: false,
                message: 'Course not found.',
            }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const serverPricing = String(courseDoc.pricingType || 'paid').trim() || 'paid';
        const directRegisterTypes = new Set(['free', 'donation', 'payAtDoor']);

        if (!directRegisterTypes.has(serverPricing)) {
            return new Response(JSON.stringify({
                success: false,
                message: 'Paid courses must be completed via Stripe checkout.',
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (serverPricing === 'donation' && donationAmount != null && Number(donationAmount) > 0) {
            return new Response(JSON.stringify({
                success: false,
                message: 'Paid donations must be completed via Stripe checkout.',
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (await courseRegistrationExists(sanityWriteClient, cid, email)) {
            return new Response(
                JSON.stringify({
                    success: false,
                    message: COURSE_REGISTRATION_DUPLICATE_MESSAGE,
                }),
                {
                    status: 409,
                    headers: { 'Content-Type': 'application/json' },
                },
            );
        }

        const capacity = await assertCourseAcceptsRegistrations(sanityWriteClient, cid);
        if (!capacity.ok) {
            return new Response(
                JSON.stringify({ success: false, message: capacity.message }),
                { status: 403, headers: { 'Content-Type': 'application/json' } },
            );
        }

        const registrationDoc: Record<string, unknown> = {
            _type: 'courseRegistration',
            course: {
                _type: 'reference',
                _ref: cid,
            },
            courseName: courseDoc.name || courseName || 'Unknown Course',
            firstName,
            lastName,
            email,
            phone: phone || undefined,
            pricingType: serverPricing,
            createdAt: new Date().toISOString(),
        };

        if (serverPricing === 'donation') {
            registrationDoc.donationAmount = 0;
            registrationDoc.donationCurrency = 'EUR';
        }

        const created = await sanityWriteClient.create(registrationDoc);

        await maybeCloseCourseWhenFull(sanityWriteClient, cid);

        return new Response(JSON.stringify({
            success: true,
            message: 'Registration successful!',
            id: created._id,
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('Course registration error:', error);
        return new Response(JSON.stringify({
            success: false,
            message: 'Registration failed. Please try again later.',
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
};
