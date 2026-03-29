import type { APIRoute } from 'astro';
import { createClient } from "@sanity/client";

const sanityWriteClient = createClient({
    projectId: 'sovnyov1',
    dataset: 'production',
    useCdn: false,
    token: import.meta.env.SANITY_API_TOKEN,
    apiVersion: '2024-03-01',
});

export const POST: APIRoute = async ({ request }) => {
    try {
        const data = await request.json();
        const { firstName, lastName, email, phone, courseId, courseName, pricingType, donationAmount } = data;

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

        const registrationDoc: Record<string, any> = {
            _type: 'courseRegistration',
            course: {
                _type: 'reference',
                _ref: courseId,
            },
            courseName: courseName || 'Unknown Course',
            firstName,
            lastName,
            email,
            phone: phone || undefined,
            pricingType: pricingType || 'free',
            createdAt: new Date().toISOString(),
        };

        if (pricingType === 'donation' && donationAmount && donationAmount > 0) {
            registrationDoc.donationAmount = donationAmount;
        }

        const created = await sanityWriteClient.create(registrationDoc);

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
            message: error instanceof Error ? error.message : 'Registration failed',
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
};
