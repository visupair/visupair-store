import { ActionError, defineAction } from 'astro:actions';
import { Resend } from 'resend';
import { z } from 'astro:schema';

const resend = new Resend(import.meta.env.RESEND_API_KEY);

export const server = {
    send: defineAction({
        accept: 'form',
        input: z.object({
            to: z.string().email(),
            subject: z.string(),
            html: z.string(),
        }),
        handler: async ({ to, subject, html }) => {
            const { data, error } = await resend.emails.send({
                from: 'Acme <onboarding@resend.dev>',
                to: [to],
                subject: subject,
                html: html,
            });

            if (error) {
                throw new ActionError({
                    code: 'BAD_REQUEST',
                    message: error.message,
                });
            }

            return data;
        },
    }),
};
