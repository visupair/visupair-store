import type { APIRoute } from 'astro';
import { createClient } from "@sanity/client";
import { Resend } from 'resend';
import {
    checkRateLimit,
    RATE_LIMITS,
    resolveVisupairKv,
    tooManyRequestsResponse,
} from "../../lib/rate-limit-kv";

// Initialize server-side only clients
const sanityWriteClient = createClient({
    projectId: 'sovnyov1',
    dataset: 'production',
    useCdn: false, // Must be false for writes
    token: import.meta.env.SANITY_API_TOKEN, // Requires server-side token
    apiVersion: '2024-03-01',
});

const resend = new Resend(import.meta.env.RESEND_API_KEY);


export const POST: APIRoute = async (context) => {
    const { request, locals } = context;
    try {
        const kv = await resolveVisupairKv(context);
        const rl = await checkRateLimit(kv, request, RATE_LIMITS.submitProposal);
        if (!rl.ok) return tooManyRequestsResponse(rl.retryAfterSeconds);

        const data = await request.json();
        const {
            fullName,
            email,
            companyName,
            businessDesc,
            startDate,
            endDate,
            service_id,
            plan_name
        } = data;

        // 1. Create Proposal Document in Sanity
        const proposalDoc = {
            _type: 'proposal',
            name: fullName,
            email: email,
            company: companyName,
            // Create reference to service if provided
            service: service_id ? { _type: 'reference', _ref: service_id } : undefined, // Note: service_id must be the _id, not slug. Frontend might send slug. Ideally, we should lookup via slug or send _id.
            // But for now, let's just store plan name as string
            plan: plan_name,
            message: `${businessDesc}\n\nTimeline: ${startDate || 'N/A'} - ${endDate || 'N/A'}`,
            createdAt: new Date().toISOString(),
        };

        // Note: If service_id is a slug, we can't use it directly as a reference _ref.
        // If the frontend sends the slug, and not the _id, we might need to query for the _id first.
        // However, `getServices` returns `id: service.slug`. This means the frontend HAS the slug, but thinks it's an ID.
        // We should probably look it up.

        let serviceRef = undefined;
        if (service_id) {
            // Try to find the service document ID by slug
            const service = await sanityWriteClient.fetch(`*[_type == "service" && slug.current == $slug][0]._id`, { slug: service_id });
            if (service) {
                serviceRef = { _type: 'reference', _ref: service };
            }
        }

        const createdProposal = await sanityWriteClient.create({
            ...proposalDoc,
            service: serviceRef
        });


        // 2. Send Email Notification via Resend
        console.log('📧 Attempting to send emails...');

        // Get API Key from Cloudflare locals (runtime env) or fallback to import.meta.env
        // @ts-ignore - types for locals might not clearly define runtime
        // @ts-ignore
        const { env: cfEnv } = await import("cloudflare:workers").catch(() => ({ env: {} }));
        let runtimeEnv = cfEnv || {};
        try {
            if (locals.runtime && typeof locals.runtime === 'object') {
                const descriptor = Object.getOwnPropertyDescriptor(locals.runtime, 'env');
                if (descriptor && typeof descriptor.get !== 'function') {
                    runtimeEnv = (locals.runtime as any).env || {};
                }
            }
        } catch (e) { }
        const apiKey = runtimeEnv.RESEND_API_KEY || import.meta.env.RESEND_API_KEY;

        const resend = new Resend(apiKey);

        try {
            // Send to Admin
            const adminResult = await resend.emails.send({
                from: 'Visupair <onboarding@resend.dev>',
                to: import.meta.env.ADMIN_EMAIL || 'visupair@gmail.com',
                subject: `New Proposal Request: ${plan_name} - ${fullName}`,
                html: `
            <h1>New Proposal Request</h1>
            <p><strong>Name:</strong> ${fullName}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Company:</strong> ${companyName}</p>
            <p><strong>Service:</strong> ${service_id} - ${plan_name}</p>
            <p><strong>Timeline:</strong> ${startDate || 'N/A'} to ${endDate || 'N/A'}</p>
            <hr />
            <h3>Project Description:</h3>
            <p>${businessDesc}</p>
            <hr />
            <p><a href="https://visupair-store.sanity.studio/structure/proposal;${createdProposal._id}">View in Sanity Studio</a></p>
          `
            });

            if (adminResult.error) {
                console.error('Admin email error:', adminResult.error);
            } else {
                console.log('Admin email sent:', adminResult.data);
            }

            // Send Confirmation to User
            const userResult = await resend.emails.send({
                from: 'Visupair <onboarding@resend.dev>',
                to: email,
                subject: `We received your request!`,
                html: `
            <h1>Hi ${fullName},</h1>
            <p>Thanks for reaching out! We've received your request for the <strong>${plan_name}</strong> package.</p>
            <p>We'll review your details and get back to you within 1-2 business days.</p>
            <br />
            <p>Best,<br/>The Visupair Team</p>
            `
            });

            if (userResult.error) {
                console.error('User email error:', userResult.error);
            } else {
                console.log('User email sent:', userResult.data);
            }
        } catch (emailError) {
            console.error('Email sending exception:', emailError);
        }

        return new Response(JSON.stringify({
            success: true,
            message: "Proposal submitted successfully",
            id: createdProposal._id
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error("Proposal submission error:", error);
        return new Response(JSON.stringify({
            success: false,
            message: error instanceof Error ? error.message : "Failed to submit proposal"
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
