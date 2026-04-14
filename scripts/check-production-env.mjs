#!/usr/bin/env node
/**
 * Loads `.env` from the repo root (if present) and verifies variables needed
 * for checkout, webhooks, and auth. Run before deploy: `npm run check:env`
 *
 * In production (Cloudflare Workers), set the same variables in the dashboard;
 * this script is mainly for local / CI parity.
 */
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env") });

const groups = [
    {
        name: "Stripe + Sanity (checkout & webhooks)",
        keys: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "SANITY_API_TOKEN"],
    },
    {
        name: "Better Auth",
        keys: ["BETTER_AUTH_SECRET", "BETTER_AUTH_URL"],
    },
];

let failed = false;
for (const g of groups) {
    const missing = g.keys.filter((k) => !process.env[k]?.trim());
    if (missing.length) {
        console.error(`✖ ${g.name}: missing or empty: ${missing.join(", ")}`);
        failed = true;
    } else {
        console.log(`✓ ${g.name}`);
    }
}

const secret = process.env.BETTER_AUTH_SECRET?.trim();
if (secret && secret.length < 32) {
    console.error("✖ BETTER_AUTH_SECRET must be at least 32 characters");
    failed = true;
}

console.log("");
console.log(
    "Stripe Dashboard: point the webhook to /api/stripe/webhook and subscribe to",
);
console.log("  • checkout.session.completed");
console.log("  • checkout.session.expired");
console.log("");
console.log("Deploy (Astro + @astrojs/cloudflare uses Workers, not Pages on dist root):");
console.log("  • npm run build && npx wrangler deploy");
console.log("  • Or: npm run deploy (same as above)");
console.log(
    "  • Set production env vars / secrets in the Cloudflare dashboard for this Worker,",
);
console.log("    or use `wrangler secret put NAME` (they are not read from GitHub).");
console.log("");
console.log("Production reminders (not env vars):");
console.log(
    "  • wrangler.toml: VISUPAIR_KV binding must exist for public API rate limits",
);
console.log(
    "  • Astro may inject a SESSION KV binding; if deploy fails, add [[kv_namespaces]] binding = \"SESSION\" with a real KV id from the dashboard or `wrangler kv namespace create`",
);
console.log(
    "  • RESEND_API_KEY + ADMIN_EMAIL: contact / support / restock forms send mail",
);
console.log(
    "  • When using Stripe Price IDs on products/courses, keep Sanity catalog prices",
);
console.log(
    "    aligned with Stripe Price objects (checkout charges the Stripe amount).",
);
console.log(
    "  • Optional drift check: npm run check:stripe-sanity-prices (requires Stripe + Sanity)",
);
console.log("");

process.exit(failed ? 1 : 0);
