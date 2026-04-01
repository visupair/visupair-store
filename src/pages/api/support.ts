import type { APIRoute } from 'astro';
import { createClient } from "@sanity/client";
import { Resend } from 'resend';

const sanityWriteClient = createClient({
    projectId: 'sovnyov1',
    dataset: 'production',
    useCdn: false,
    token: import.meta.env.SANITY_API_TOKEN,
    apiVersion: '2024-03-01',
});

export const POST: APIRoute = async ({ request, locals }) => {
    try {
        const data = await request.json();
        const { firstName, lastName, email, subject, message } = data;

        // Save to Sanity as a supportSubmission document
        const doc = {
            _type: 'supportSubmission',
            firstName,
            lastName,
            email,
            subject,
            message,
            status: 'new',
            createdAt: new Date().toISOString(),
        };

        const created = await sanityWriteClient.create(doc);

        // Resolve Resend API key (Cloudflare Workers runtime or .env)
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
        } catch (_) { }
        const apiKey = runtimeEnv.RESEND_API_KEY || import.meta.env.RESEND_API_KEY;

        const resend = new Resend(apiKey);

        try {
            // Notify admin
            await resend.emails.send({
                from: 'Visupair <onboarding@resend.dev>',
                to: import.meta.env.ADMIN_EMAIL || 'visupair@gmail.com',
                subject: `New Support Request: ${subject}`,
                html: `
                    <h1>New Support Request</h1>
                    <p><strong>Name:</strong> ${firstName} ${lastName}</p>
                    <p><strong>Email:</strong> ${email}</p>
                    <p><strong>Subject:</strong> ${subject}</p>
                    <hr />
                    <h3>Message:</h3>
                    <p>${message}</p>
                    <hr />
                    <p><a href="https://visupair-store.sanity.studio/structure/supportSubmission;${created._id}">View in Sanity Studio</a></p>
                `,
            });

            // Confirm to user
            await resend.emails.send({
                from: 'Visupair <onboarding@resend.dev>',
                to: email,
                subject: `We received your support request!`,
                html: `
                    <h1>Hi ${firstName},</h1>
                    <p>Thanks for reaching out! We've received your support request and will get back to you within 24 hours.</p>
                    <p><strong>Subject:</strong> ${subject}</p>
                    <br />
                    <p>Best,<br/>The Visupair Team</p>
                `,
            });
        } catch (emailError) {
            console.error('Support email error:', emailError);
        }

        return new Response(JSON.stringify({
            success: true,
            message: "Support request submitted successfully",
            id: created._id,
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error("Support submission error:", error);
        return new Response(JSON.stringify({
            success: false,
            message: error instanceof Error ? error.message : "Failed to submit support request",
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
