import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./auth-schema";

/** Served from `public/` — must match a live URL on your deployed host (not localhost for real recipients). */
const VISUPAIR_EMAIL_LOGO_PATH = "/images/logos/visupair-logo-email.jpg";

/**
 * Public origin for hosted assets in transactional email (`<img src="https://...">`).
 * Prefer `PUBLIC_SITE_URL` in production (Cloudflare / `.env`); else derive from `BETTER_AUTH_URL`.
 */
function resolveEmailPublicOrigin(env?: Record<string, string>): string {
  const raw =
    env?.PUBLIC_SITE_URL ||
    process.env.PUBLIC_SITE_URL ||
    env?.BETTER_AUTH_URL ||
    process.env.BETTER_AUTH_URL ||
    "https://visupair.com";
  try {
    const normalized = raw.includes("://") ? raw : `https://${raw}`;
    return new URL(normalized).origin;
  } catch {
    return "https://visupair.com";
  }
}

function addOrigin(set: Set<string>, raw: string | undefined) {
  if (!raw?.trim()) return;
  try {
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    set.add(u.origin);
  } catch {
    /* ignore invalid */
  }
}

/** CSRF / Origin checks: browser Origin must match (e.g. 127.0.0.1 ≠ localhost). */
function buildTrustedOrigins(
  baseURL: string,
  env?: Record<string, string>,
): string[] {
  const set = new Set<string>();
  const devHosts = ["localhost", "127.0.0.1"];
  const devPorts = ["4321", "8787", "4173", "3000"];
  for (const host of devHosts) {
    for (const port of devPorts) {
      set.add(`http://${host}:${port}`);
    }
  }
  addOrigin(set, baseURL);
  addOrigin(set, env?.PUBLIC_SITE_URL);
  addOrigin(set, process.env.PUBLIC_SITE_URL);
  addOrigin(set, env?.BETTER_AUTH_URL);
  addOrigin(set, process.env.BETTER_AUTH_URL);
  const extra =
    env?.BETTER_AUTH_TRUSTED_ORIGINS || process.env.BETTER_AUTH_TRUSTED_ORIGINS;
  if (extra) {
    for (const part of extra.split(",")) addOrigin(set, part.trim());
  }
  for (const o of [...set]) {
    try {
      const u = new URL(o);
      const host = u.hostname;
      if (host.startsWith("www.")) {
        set.add(`${u.protocol}//${host.replace(/^www\./, "")}`);
      } else if (
        host !== "localhost" &&
        !host.startsWith("127.") &&
        host.includes(".")
      ) {
        set.add(`${u.protocol}//www.${host}`);
      }
    } catch {
      /* */
    }
  }
  return [...set].filter(Boolean);
}

function buildEmailLogoBlock(absoluteLogoUrl: string): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom:20px;">
                    <img src="${absoluteLogoUrl}" width="160" alt="Visupair" style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;max-width:160px;width:160px;height:auto;">
                  </td>
                </tr>
              </table>`;
}

/** Centered, card-style HTML for auth emails (table layout for broad client support). */
function visupairAuthEmailLayout(opts: {
  preheader?: string;
  title: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
  footerHtml: string;
  /** HTTPS URL to JPEG in `public/images/logos/` (works when the site is deployed; localhost won’t load for external inboxes). */
  logoImageUrl: string;
}): string {
  const {
    preheader,
    title,
    bodyHtml,
    ctaLabel,
    ctaUrl,
    footerHtml,
    logoImageUrl,
  } = opts;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#e8eaef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>` : ""}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#e8eaef;padding:32px 16px 48px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:520px;">
          <tr>
            <td style="background:#ffffff;border-radius:18px;padding:40px 32px 36px;box-shadow:0 8px 32px rgba(26,26,30,0.06);border:1px solid rgba(132,128,255,0.18);">
              ${buildEmailLogoBlock(logoImageUrl)}
              <h1 style="margin:0 0 24px;font-size:22px;font-weight:700;color:#12121a;text-align:center;line-height:1.3;">${title}</h1>
              <div style="color:#3d3d45;font-size:16px;line-height:1.7;text-align:center;">
                ${bodyHtml}
              </div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:32px;">
                <tr>
                  <td align="center">
                    <a href="${ctaUrl}" style="display:inline-block;padding:14px 32px;background:#8480ff;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:600;font-size:15px;letter-spacing:0.02em;">${ctaLabel}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:28px 0 0;font-size:13px;line-height:1.55;color:#888894;text-align:center;">
                ${footerHtml}
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:24px;font-size:12px;color:#9a9aa6;">Visupair · Digital studio &amp; store</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendVisupairTransactionalEmail(
  env: Record<string, string> | undefined,
  opts: {
    to: string;
    subject: string;
    html: string;
  },
): Promise<void> {
  const resendApiKey = env?.RESEND_API_KEY || process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    console.error("[Auth] RESEND_API_KEY not set — cannot send email");
    return;
  }
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(resendApiKey);
    await resend.emails.send({
      from: "Visupair <info@visupair.com>",
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
  } catch (emailError) {
    console.error("[Auth] Failed to send email:", emailError);
  }
}

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

  const emailLogoUrl = `${resolveEmailPublicOrigin(env)}${VISUPAIR_EMAIL_LOGO_PATH}`;

  return betterAuth({
    baseURL,
    basePath: "/api/auth",
    secret,
    database: drizzleAdapter(db, {
      provider: "sqlite",
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: async ({ user, url }) => {
        await sendVisupairTransactionalEmail(env, {
          to: user.email,
          subject: "Reset your Visupair password",
          html: visupairAuthEmailLayout({
            logoImageUrl: emailLogoUrl,
            preheader: "Reset your Visupair password.",
            title: "Reset your password",
            bodyHtml: `<p style="margin:0 0 16px;">We received a request to reset the password for your Visupair account tied to <strong style="color:#1a1a1e;">${user.email}</strong>.</p>
              <p style="margin:0;">Tap the button below to choose a new password.</p>`,
            ctaLabel: "Reset password",
            ctaUrl: url,
            footerHtml:
              "If you didn&rsquo;t ask for this, you can ignore this email — your password will stay the same.",
          }),
        });
      },
    },
    emailVerification: {
      expiresIn: 3600,
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendVisupairTransactionalEmail(env, {
          to: user.email,
          subject: "Confirm your Visupair email",
          html: visupairAuthEmailLayout({
            logoImageUrl: emailLogoUrl,
            preheader: `Confirm ${user.email} for Visupair.`,
            title: "Confirm your email",
            bodyHtml: `<p style="margin:0 0 16px;">Use the button below to verify this address for your Visupair account.</p>
              <p style="margin:0;"><strong style="color:#1a1a1e;font-size:15px;word-break:break-all;">${user.email}</strong></p>`,
            ctaLabel: "Verify email",
            ctaUrl: url,
            footerHtml:
              "Didn&rsquo;t start this? You can ignore this message.",
          }),
        });
      },
    },
    user: {
      changeEmail: {
        enabled: true,
        sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
          await sendVisupairTransactionalEmail(env, {
            to: user.email,
            subject: "Confirm email change — Visupair",
            html: visupairAuthEmailLayout({
              logoImageUrl: emailLogoUrl,
              preheader: "Confirm changing your Visupair sign-in email.",
              title: "Email change request",
              bodyHtml: `<p style="margin:0 0 20px;">Someone started an email update for your Visupair account.</p>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 auto 20px;text-align:center;">
                  <tr>
                    <td style="padding:14px 16px;background:#f5f4ff;border-radius:10px;border:1px solid rgba(132,128,255,0.2);">
                      <p style="margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:#8480ff;">Current email</p>
                      <p style="margin:0;font-size:15px;font-weight:600;color:#1a1a1e;word-break:break-all;">${user.email}</p>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 16px;font-size:22px;line-height:1;color:#cbc8e8;">↓</p>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 auto 24px;text-align:center;">
                  <tr>
                    <td style="padding:14px 16px;background:#fafafa;border-radius:10px;border:1px solid #e8e8ec;">
                      <p style="margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:#69696f;">New email</p>
                      <p style="margin:0;font-size:15px;font-weight:600;color:#1a1a1e;word-break:break-all;">${newEmail}</p>
                    </td>
                  </tr>
                </table>
                <p style="margin:0;">After you continue, we&rsquo;ll send a second message to the <strong style="color:#1a1a1e;">new address</strong> to finish the update.</p>`,
              ctaLabel: "Continue email change",
              ctaUrl: url,
              footerHtml:
                "Not you? Secure your account and <a href=\"mailto:support@visupair.com\" style=\"color:#8480ff;\">contact support</a>.",
            }),
          });
        },
      },
      deleteUser: {
        enabled: true,
      },
    },
    plugins: [],
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["google"],
        updateUserInfoOnLink: true,
      },
    },
    socialProviders: {
      google: {
        clientId: env?.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID!,
        clientSecret: env?.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET!,
        /** After email/password signup, a Google sign-in updates `user.image` (and name) from Google. */
        overrideUserInfoOnSignIn: true,
      },
    },
    trustedOrigins: buildTrustedOrigins(baseURL, env),
    trustHost: true, // Required for Cloudflare Workers
  });
}