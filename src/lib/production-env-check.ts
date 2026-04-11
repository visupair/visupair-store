/**
 * Fail fast when critical env vars are missing so production misconfiguration
 * surfaces as clear 503s + server logs instead of opaque Stripe/Sanity errors.
 *
 * Stripe Dashboard: subscribe the webhook endpoint to at least
 * `checkout.session.completed` and `checkout.session.expired`
 * (expired releases inventory held at Checkout open).
 */

function isBlankEnv(v: unknown): boolean {
    return typeof v !== "string" || v.trim().length === 0;
}

export function getMissingEnvKeys(keys: readonly string[]): string[] {
    return keys.filter((k) => isBlankEnv(import.meta.env[k]));
}

const CHECKOUT_API_KEYS = ["STRIPE_SECRET_KEY", "SANITY_API_TOKEN"] as const;

const STRIPE_WEBHOOK_KEYS = [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "SANITY_API_TOKEN",
] as const;

function envMisconfigResponse(
    missing: string[],
    label: string,
): Response {
    console.error(`[visupair] ${label}: missing env`, missing.join(", "));
    const dev = import.meta.env.DEV;
    return new Response(
        JSON.stringify({
            error: dev
                ? `Missing environment variables: ${missing.join(", ")}`
                : "Server configuration error. Payment or webhooks are not available.",
            ...(dev ? { missing: [...missing] } : {}),
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
    );
}

/** Call at the start of `/api/cart-checkout` and `/api/create-checkout` (after auth if desired). */
export function checkoutApisEnvGuard(): Response | null {
    const missing = getMissingEnvKeys(CHECKOUT_API_KEYS);
    if (missing.length === 0) return null;
    return envMisconfigResponse(missing, "Checkout API");
}

/**
 * Call at the start of `POST /api/stripe/webhook` before reading the body.
 * Returns null only when Stripe + Sanity writer token are present.
 */
export function stripeWebhookEnvGuard(): Response | null {
    const missing = getMissingEnvKeys(STRIPE_WEBHOOK_KEYS);
    if (missing.length === 0) return null;
    return new Response(
        JSON.stringify({
            error: "Webhook endpoint is not configured (missing secrets).",
            ...(import.meta.env.DEV ? { missing: [...missing] } : {}),
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
    );
}
