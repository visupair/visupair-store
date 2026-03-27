import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./auth-schema";

/**
 * Creates a Better Auth instance for Astro + Cloudflare D1
 * 
 * @param dbBinding - The D1 database binding from Cloudflare runtime
 * @param env - Environment variables (BETTER_AUTH_SECRET, BETTER_AUTH_URL)
 * @returns Configured Better Auth instance
 */
export function createAuth(dbBinding: D1Database, env?: Record<string, string>) {
  if (!dbBinding) {
    throw new Error("D1 database binding is required");
  }

  // Initialize Drizzle with D1 binding
  const db = drizzle(dbBinding, { schema });

  // Get environment variables (works in both dev and production)
  const secret = env?.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET;
  const baseURL = env?.BETTER_AUTH_URL || process.env.BETTER_AUTH_URL || "http://localhost:4321";

  if (!secret || secret.length < 32) {
    throw new Error(
      "BETTER_AUTH_SECRET must be set and at least 32 characters long. " +
      "Generate one with: openssl rand -base64 32"
    );
  }

  return betterAuth({
    baseURL,
    basePath: "/api/auth",
    secret,
    database: drizzleAdapter(db, {
      provider: "sqlite",
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false, // Disabled for dev setup as requested
      sendResetPassword: async ({ user, url }) => {
        const resendApiKey = env?.RESEND_API_KEY || process.env.RESEND_API_KEY;
        if (!resendApiKey) {
          console.error("[Auth] RESEND_API_KEY not set — cannot send reset email");
          return;
        }
        try {
          const { Resend } = await import("resend");
          const resend = new Resend(resendApiKey);
          await resend.emails.send({
            from: "Visupair <no-reply@visupair.com>",
            to: user.email,
            subject: "Reset your Visupair password",
            html: `
              <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
                <h2 style="font-size:22px;font-weight:700;margin-bottom:12px;">Reset your password</h2>
                <p style="color:#555;margin-bottom:24px;">
                  We received a request to reset the password for your Visupair account.
                  Click the button below — the link is valid for <strong>1 hour</strong>.
                </p>
                <a href="${url}" style="display:inline-block;padding:12px 28px;background:#8480ff;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">
                  Reset Password
                </a>
                <p style="color:#999;font-size:13px;margin-top:24px;">
                  If you didn't request this, you can safely ignore this email.
                </p>
              </div>
            `,
          });
        } catch (emailError) {
          console.error("[Auth] Failed to send reset email:", emailError);
        }
      },
    },
    plugins: [],
    socialProviders: {
      google: {
        clientId: env?.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID!,
        clientSecret: env?.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET!,
      },
    },
    trustedOrigins: [
      "http://localhost:4321",
      "http://localhost:8787",
      baseURL,
    ],
    trustHost: true, // Required for Cloudflare Workers
  });
}