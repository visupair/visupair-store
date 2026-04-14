/**
 * Resolve auth-related env vars from the Cloudflare Worker runtime.
 *
 * Production builds must NEVER use `import.meta.env` for secrets (BETTER_AUTH_SECRET,
 * GOOGLE_CLIENT_SECRET, etc.) because Vite bakes `.env` values into the bundle at
 * build time, leaking local dev credentials into the deployed Worker.
 *
 * Only PUBLIC_* vars and build-time flags (PROD, DEV, SSR, SITE) are safe from
 * `import.meta.env`.
 */

const SECRET_KEYS = [
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "RESEND_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "PUBLIC_SITE_URL",
  "BETTER_AUTH_TRUSTED_ORIGINS",
] as const;

/**
 * Build an env record from the Cloudflare Worker runtime env object.
 *
 * In **production** we ONLY read auth/secret vars from `runtimeEnv`
 * (the `cloudflare:workers` env or `locals.runtime.env`).
 *
 * In **dev** we fall back to `import.meta.env` / `process.env` for convenience.
 */
export function mergeAuthEnv(
  runtimeEnv: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};

  if (import.meta.env.PROD) {
    // Production: only trust the Worker runtime for secret/config vars.
    for (const key of SECRET_KEYS) {
      const val = runtimeEnv[key];
      if (typeof val === "string" && val.trim()) {
        out[key] = val;
      }
    }
  } else {
    // Dev: merge import.meta.env, then override with runtime values.
    const im = import.meta.env as unknown as Record<string, string>;
    for (const [k, v] of Object.entries(im)) {
      if (typeof v === "string") out[k] = v;
    }
    for (const key of SECRET_KEYS) {
      const val =
        runtimeEnv[key] ??
        (typeof process !== "undefined" ? process.env[key] : undefined);
      if (typeof val === "string" && val.trim()) {
        out[key] = val;
      }
    }
  }

  return out;
}
