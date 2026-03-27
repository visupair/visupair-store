import type { APIRoute } from 'astro';
import { createClient } from "@sanity/client";
import { Resend } from 'resend';

// Initialize server-side only clients
const sanityWriteClient = createClient({
    projectId: 'sovnyov1',
    dataset: 'production',
    useCdn: false, // Must be false for writes
    token: import.meta.env.SANITY_API_TOKEN, // Requires server-side token
    apiVersion: '2024-03-01',
});

export const POST: APIRoute = async ({ request, locals }) => {
    try {
        const data = await request.json();
        const {
            firstName,
            lastName,
            email,
            company,
            message
        } = data;

        // 1. Create Contact Document in Sanity
        const contactDoc = {
            _type: 'contact',
            firstName,
            lastName,
            email,
            company,
            message,
            createdAt: new Date().toISOString(),
        };

        const createdContact = await sanityWriteClient.create(contactDoc);

        // 2. Send Email Notification via Resend
        console.log('📧 Attempting to send contact emails...');

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
                subject: `New Contact Request: ${firstName} ${lastName}`,
                html: `
            <h1>New Contact Request</h1>
            <p><strong>Name:</strong> ${firstName} ${lastName}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Company:</strong> ${company || 'N/A'}</p>
            <hr />
            <h3>Message:</h3>
            <p>${message}</p>
            <hr />
            <p><a href="https://visupair-store.sanity.studio/structure/contact;${createdContact._id}">View in Sanity Studio</a></p>
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
                subject: `We received your message!`,
                html: `
            <h1>Hi ${firstName},</h1>
            <p>Thanks for reaching out! We've received your message and will get back to you as soon as possible.</p>
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
            message: "Message sent successfully",
            id: createdContact._id
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error("Contact submission error:", error);
        return new Response(JSON.stringify({
            success: false,
            message: error instanceof Error ? error.message : "Failed to send message"
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
